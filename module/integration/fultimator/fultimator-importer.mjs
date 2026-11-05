import { FUHooks } from '../../hooks.mjs';
import { SYSTEM } from '../../helpers/config.mjs';
import FoundryUtils from '../../helpers/foundry-utils.mjs';
import { FileUtils } from '../../helpers/file-utils.mjs';
import { StringUtils } from '../../helpers/string-utils.mjs';
import { mapFultimatorActor } from './fultimator-mapper.mjs';

/**
 * @file Imports NPCs and player characters exported as JSON from Fultimator (https://fultimator.com).
 */

const LOG_PREFIX = 'Fultimator Import |';

/**
 * @typedef FultimatorSource
 * @property {string} label Where the JSON came from (a file name, or the pasted text)
 * @property {string} text
 */

/**
 * @typedef FultimatorImportResult
 * @property {string} label
 * @property {FUActor} [actor]
 * @property {string[]} warnings Localized warnings
 * @property {string} [error]
 */

/**
 * @desc Indexes the system's Item compendiums by type and lowercase name.
 * @returns {Promise<Map<string, Array<{uuid: string, classFuid?: string}>>>}
 */
async function buildCompendiumIndex() {
	const index = new Map();
	const packs = game.packs.filter((pack) => pack.documentName === 'Item' && pack.metadata.packageName === SYSTEM);
	for (const pack of packs) {
		const entries = await pack.getIndex({ fields: ['type', 'system.class.value'] });
		for (const entry of entries) {
			const key = `${entry.type}:${entry.name.toLowerCase()}`;
			if (!index.has(key)) index.set(key, []);
			index.get(key).push({ uuid: entry.uuid, classFuid: entry.system?.class?.value });
		}
	}
	return index;
}

/**
 * @param {Map} index
 * @param {{type: string, name: string, classFuid?: string}} lookup
 * @returns {Promise<Object|null>} Item data from the best matching compendium item
 */
async function findCompendiumItem(index, lookup) {
	const candidates = index.get(`${lookup.type}:${lookup.name.toLowerCase()}`);
	if (!candidates?.length) return null;
	// Skills and spells can share a name across classes, so prefer the one from the same class
	const match = candidates.find((candidate) => lookup.classFuid && candidate.classFuid === lookup.classFuid) ?? candidates[0];
	const document = await fromUuid(match.uuid);
	return document ? game.items.fromCompendium(document) : null;
}

/**
 * @param {import('./fultimator-mapper.mjs').FultimatorWarning} warning
 * @returns {string}
 */
function localizeWarning(warning) {
	return StringUtils.localize(warning.key, warning.data);
}

/**
 * @desc Fills the actor's equipment slots with the items marked for equipping, in order.
 * @param {Array<{id: string, kind: string, data: Object}>} equipped
 * @returns {Object} The actor's system.equipped data
 */
function planEquipment(equipped) {
	const slots = { mainHand: null, offHand: null, armor: null, accessory: null };
	for (const { id, kind, data } of equipped) {
		if (kind === 'weapon') {
			if (data.system?.hands?.value === 'two-handed') {
				if (!slots.mainHand && !slots.offHand) slots.mainHand = slots.offHand = id;
			} else if (!slots.mainHand) {
				slots.mainHand = id;
			} else if (!slots.offHand) {
				slots.offHand = id;
			}
		} else if (kind === 'shield') {
			slots.offHand ??= id;
		} else {
			slots[kind] ??= id;
		}
	}
	return slots;
}

/**
 * @param {Object} json Parsed Fultimator JSON for one actor
 * @param {Map} index The compendium index
 * @param {boolean} preferCompendium Whether to use matching compendium items
 * @returns {Promise<{actor: FUActor, warnings: string[]}>}
 */
async function importActor(json, index, preferCompendium) {
	const mapped = mapFultimatorActor(json);
	const warnings = mapped.warnings.map(localizeWarning);
	const items = [];
	const equipped = [];

	for (const spec of mapped.items) {
		let data = null;
		if (spec.lookup && (preferCompendium || spec.compendiumOnly)) {
			data = await findCompendiumItem(index, spec.lookup);
			if (data && spec.overrides) foundry.utils.mergeObject(data, spec.overrides);
		}
		if (!data) {
			if (spec.compendiumOnly) {
				warnings.push(StringUtils.localize('FU.FultimatorWarningEquipmentNotFound', { name: spec.data.name }));
				continue;
			}
			data = foundry.utils.deepClone(spec.data);
		}
		// Ids are assigned up front so the equipment slots can be filled in the same create operation
		data._id = foundry.utils.randomID();
		items.push(data);
		if (spec.equip) equipped.push({ id: data._id, kind: spec.equip, data });
	}

	const actorData = foundry.utils.deepClone(mapped.actor);
	actorData.items = items;
	if (equipped.length) {
		actorData.system.equipped = planEquipment(equipped);
		// NPCs only use equipment stats when this is enabled
		if (mapped.type === 'npc') actorData.system.useEquipment = { value: true };
	}

	const actor = await foundry.documents.Actor.implementation.create(actorData, { keepEmbeddedIds: true });
	// NPC exports have no current HP/MP, so start them at full health
	if (mapped.type === 'npc') {
		await actor.update({ 'system.resources.hp.value': actor.system.resources.hp.max, 'system.resources.mp.value': actor.system.resources.mp.max });
	}
	return { actor, warnings };
}

/**
 * @param {FultimatorSource[]} sources
 * @param {boolean} preferCompendium
 * @returns {Promise<FultimatorImportResult[]>}
 */
async function importSources(sources, preferCompendium) {
	const index = await buildCompendiumIndex();
	const results = [];
	for (const { label, text } of sources) {
		let parsed;
		try {
			parsed = JSON.parse(text);
		} catch (error) {
			results.push({ label, warnings: [], error: error.message });
			continue;
		}
		// A file may hold a single export or a list of them
		const entries = Array.isArray(parsed) ? parsed : [parsed];
		for (const [i, json] of entries.entries()) {
			const entryLabel = entries.length > 1 ? `${label} #${i + 1}` : label;
			try {
				results.push({ label: entryLabel, ...(await importActor(json, index, preferCompendium)) });
			} catch (error) {
				console.error(LOG_PREFIX, entryLabel, error);
				results.push({ label: entryLabel, warnings: [], error: error.message });
			}
		}
	}
	return results;
}

/**
 * @param {FultimatorImportResult[]} results
 */
async function reportResults(results) {
	const imported = results.filter((result) => result.actor);
	const needsReview = results.filter((result) => result.error || result.warnings.length);
	if (imported.length) {
		ui.notifications.info(StringUtils.localize('FU.FultimatorImportSuccess', { count: imported.length }));
	}
	if (imported.length === 1 && !needsReview.length) {
		imported[0].actor.sheet.render({ force: true });
	}
	if (!needsReview.length) return;

	const content = await FoundryUtils.renderTemplate('ui/fultimator-import-summary', {
		results: needsReview.map((result) => ({
			name: result.actor?.name ?? result.label,
			uuid: result.actor?.uuid,
			error: result.error ? StringUtils.localize('FU.FultimatorImportFailed', { error: result.error }) : null,
			warnings: result.warnings,
		})),
	});
	await foundry.applications.api.DialogV2.prompt({
		window: { title: 'FU.FultimatorImport' },
		classes: ['projectfu', 'backgroundstyle', 'fu-dialog'],
		content: await foundry.applications.ux.TextEditor.implementation.enrichHTML(content),
		ok: { label: 'Close' },
		position: { width: 480 },
	});
}

/**
 * @desc Opens the import dialog, then creates an actor for every Fultimator export it is given.
 * @returns {Promise<FultimatorImportResult[]|undefined>}
 */
async function openImportDialog() {
	const sources = await foundry.applications.api.DialogV2.wait({
		window: { title: 'FU.FultimatorImport', icon: 'fa-solid fa-file-import' },
		classes: ['projectfu', 'backgroundstyle', 'fu-dialog'],
		content: await FoundryUtils.renderTemplate('ui/fultimator-import-dialog'),
		position: { width: 480 },
		buttons: [
			{
				action: 'import',
				icon: 'fa-solid fa-file-import',
				label: 'FU.Import',
				default: true,
				callback: async (event, button, dialog) => {
					const form = button.form ?? dialog.element;
					const files = Array.from(form.querySelector('input[name="files"]')?.files ?? []);
					const pasted = form.querySelector('textarea[name="json"]')?.value.trim();
					/** @type {FultimatorSource[]} */
					const result = await Promise.all(files.map(async (file) => ({ label: file.name, text: await FileUtils.readTextFromFile(file) })));
					if (pasted) result.push({ label: StringUtils.localize('FU.FultimatorImportPasted'), text: pasted });
					if (!result.length) {
						ui.notifications.warn('FU.FultimatorImportNothing', { localize: true });
						return null;
					}
					return { sources: result, preferCompendium: form.querySelector('input[name="preferCompendium"]')?.checked ?? true };
				},
			},
			{ action: 'cancel', icon: 'fa-solid fa-times', label: 'FU.Cancel' },
		],
		rejectClose: false,
	});
	if (!sources?.sources) return undefined;

	const results = await importSources(sources.sources, sources.preferCompendium);
	await reportResults(results);
	return results;
}

/**
 * @param {import('../../ui/sidebar.mjs').SidebarToolGroup[]} tools
 */
function onGetSidebarTools(tools) {
	const group = tools.find((group) => group.id === 'utilities');
	if (group) {
		group.tools.fultimatorImport = {
			icon: 'fa-solid fa-file-import',
			label: 'FU.FultimatorImport',
			tooltip: 'FU.FultimatorImportHint',
			condition: () => game.user.can('ACTOR_CREATE'),
			click: () => openImportDialog(),
		};
	}
}

function initialize() {
	Hooks.on(FUHooks.GET_SIDEBAR_TOOLS, onGetSidebarTools);
}

export const FultimatorImporter = Object.freeze({
	initialize,
	openImportDialog,
	importSources,
});
