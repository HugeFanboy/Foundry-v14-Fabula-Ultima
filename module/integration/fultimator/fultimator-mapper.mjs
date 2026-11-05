import { FU } from '../../helpers/config.mjs';
import { slugify } from '../../util.mjs';

/**
 * @file Converts JSON exported from Fultimator (https://fultimator.com) into Project FU actor and item data.
 * @remarks Pure data mapping with no Foundry API calls, so it can be unit tested. Both the current (v2) and the
 * older (pre-v2) Fultimator export formats are supported. Creating the documents and resolving compendium
 * matches is handled by the importer.
 */

/**
 * @typedef FultimatorWarning
 * @property {string} key A localization key
 * @property {Record<string, string|number>} [data] Format data for the localization key
 */

/**
 * @typedef FultimatorItemSpec
 * @property {Object} data Item data to create when no compendium match is used
 * @property {{type: string, name: string, classFuid?: string}} [lookup] A compendium item to prefer, matched by type and name
 * @property {Object} [overrides] Data merged over the compendium item when a match is used
 * @property {"weapon"|"shield"|"armor"|"accessory"} [equip] Equip the created item in the matching slot
 * @property {boolean} [compendiumOnly] Skip the item entirely when no compendium match is found
 */

/**
 * @typedef FultimatorImport
 * @property {"npc"|"character"} type
 * @property {Object} actor Actor creation data
 * @property {FultimatorItemSpec[]} items
 * @property {FultimatorWarning[]} warnings
 */

const IMAGE_EXTENSIONS = new Set(['apng', 'avif', 'bmp', 'gif', 'jpeg', 'jpg', 'png', 'svg', 'tif', 'tiff', 'webp']);
const ATTRIBUTE_DICE = new Set([6, 8, 10, 12]);
const ATTRIBUTES = { dexterity: 'dex', insight: 'ins', might: 'mig', will: 'wlp', willpower: 'wlp', dex: 'dex', ins: 'ins', mig: 'mig', wlp: 'wlp' };
const AFFINITIES = { vu: FU.affValue.vulnerability, no: FU.affValue.none, n: FU.affValue.none, rs: FU.affValue.resistance, im: FU.affValue.immunity, ab: FU.affValue.absorption };
const BOND_FEELINGS = {
	admInf: { admiration: 'admiration', inferiority: 'inferiority' },
	loyMis: { loyality: 'loyalty', loyalty: 'loyalty', mistrust: 'mistrust' },
	affHat: { affection: 'affection', hatred: 'hatred' },
};
const NO_DAMAGE = new Set(['nodmg', 'none', '']);
/** Fultimator spell types imported as regular spells; every other type is a class feature this importer skips. */
const PLAIN_SPELL_TYPES = new Set([undefined, '', 'default']);

/**
 * @param {unknown} value
 * @param {number} [fallback=0]
 * @returns {number}
 */
function toNumber(value, fallback = 0) {
	if (value === undefined || value === null || value === '') return fallback;
	const number = Number(value);
	return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
	return Math.min(Math.max(value, min), max);
}

function nameOr(name, fallback) {
	return typeof name === 'string' && name.trim() ? name.trim() : fallback;
}

function escapeHtml(text) {
	return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * @desc Converts Fultimator's plain text (with light Markdown) into safe HTML.
 * @param {string} [text]
 * @returns {string}
 */
export function textToHtml(text) {
	if (typeof text !== 'string' || !text.trim()) return '';
	return text
		.trim()
		.split(/\n\s*\n/)
		.map((paragraph) => {
			const html = escapeHtml(paragraph)
				.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
				.replace(/\*(.+?)\*/g, '<em>$1</em>')
				.replace(/\n/g, '<br>');
			return `<p>${html}</p>`;
		})
		.join('');
}

/**
 * @param {Array<{title: string, text?: string}>} sections
 * @returns {string} HTML with a heading per non-empty section
 */
function sectionsToHtml(sections) {
	return sections
		.filter((section) => section.text?.trim())
		.map((section) => `<h3>${escapeHtml(section.title)}</h3>${textToHtml(section.text)}`)
		.join('');
}

function mapAttribute(attribute, fallback = 'dex') {
	return ATTRIBUTES[String(attribute ?? '').toLowerCase()] ?? fallback;
}

/**
 * @param {string} [element]
 * @returns {string|null} A Project FU damage type, or null when the attack deals no damage
 */
export function mapDamageType(element) {
	const key = String(element ?? 'physical').toLowerCase();
	if (NO_DAMAGE.has(key)) return null;
	if (key === 'wind') return 'air';
	return key in FU.damageTypes ? key : 'physical';
}

/**
 * @param {string|number} [affinity]
 * @returns {number}
 */
export function mapAffinity(affinity) {
	if (typeof affinity === 'number') return Object.values(FU.affValue).includes(affinity) ? affinity : FU.affValue.none;
	return AFFINITIES[String(affinity ?? '').toLowerCase()] ?? FU.affValue.none;
}

function mapAffinities(affinities = {}) {
	const result = {};
	for (const type of Object.keys(FU.damageTypes)) {
		if (type === 'untyped') continue;
		const value = type === 'air' ? (affinities.air ?? affinities.wind) : affinities[type];
		result[type] = { base: mapAffinity(value) };
	}
	return result;
}

function mapAttributeDie(value, label, warnings) {
	const die = toNumber(typeof value === 'object' && value !== null ? value.base : value, 8);
	if (ATTRIBUTE_DICE.has(die)) return die;
	warnings.push({ key: 'FU.FultimatorWarningAttribute', data: { attribute: label, value: die } });
	return 8;
}

function mapAttributes(attributes = {}, willKey, warnings) {
	return {
		dex: { base: mapAttributeDie(attributes.dexterity, 'dexterity', warnings) },
		ins: { base: mapAttributeDie(attributes.insight, 'insight', warnings) },
		mig: { base: mapAttributeDie(attributes.might, 'might', warnings) },
		wlp: { base: mapAttributeDie(attributes[willKey], willKey, warnings) },
	};
}

function itemAttributes(primary, secondary) {
	return { primary: { value: mapAttribute(primary, 'dex') }, secondary: { value: mapAttribute(secondary, 'ins') } };
}

/**
 * @param {string} [url]
 * @param {FultimatorWarning[]} warnings
 * @returns {string|undefined} The URL when Foundry can use it as an image path
 */
function mapImage(url, warnings) {
	if (typeof url !== 'string' || !url.trim()) return undefined;
	const trimmed = url.trim();
	const path = trimmed.split(/[?#]/)[0];
	const extension = path.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
	if (extension && IMAGE_EXTENSIONS.has(extension)) return trimmed;
	warnings.push({ key: 'FU.FultimatorWarningImage', data: { url: trimmed } });
	return undefined;
}

function imageFields(img) {
	return img ? { img, prototypeToken: { texture: { src: img } } } : {};
}

/**
 * @param {string|number} [mp] A pre-v2 MP cost such as "10", "5 x T" or a number
 * @returns {{amount: number, perTarget: boolean}}
 */
export function parseMpCost(mp) {
	if (typeof mp === 'number') return { amount: mp, perTarget: false };
	if (typeof mp !== 'string') return { amount: 0, perTarget: false };
	const perTarget = mp.match(/(\d+)\s*[x×]\s*T/i);
	if (perTarget) return { amount: Number(perTarget[1]), perTarget: true };
	return { amount: toNumber(Number.parseInt(mp, 10)), perTarget: false };
}

/**
 * @param {string} [target] Fultimator's free-text target, e.g. "Up to three creatures"
 * @param {number} [maxTargets]
 * @returns {{rule: string, max: number}}
 */
export function mapTargeting(target, maxTargets) {
	const text = String(target ?? '').toLowerCase();
	const counts = { one: 1, two: 2, three: 3, four: 4, five: 5 };
	if (text.includes('self')) return { rule: 'self', max: 0 };
	if (text.includes('weapon')) return { rule: 'weapon', max: 1 };
	const upTo = text.match(/up to (one|two|three|four|five) creatures?/);
	if (upTo) return { rule: 'multiple', max: counts[upTo[1]] };
	if (text.includes('one creature')) return { rule: 'single', max: 1 };
	if (text.includes('special')) return { rule: 'special', max: 0 };
	const max = clamp(toNumber(maxTargets, 1), 0, 5);
	return max > 1 ? { rule: 'multiple', max } : { rule: 'single', max: 1 };
}

function mapDuration(duration) {
	const text = String(duration ?? '').toLowerCase();
	if (!text || text.includes('instant')) return 'instantaneous';
	if (text.includes('scene')) return 'scene';
	return 'special';
}

function mapWeaponCategory(category) {
	const key = String(category ?? '')
		.toLowerCase()
		.replace(/_category$/, '');
	return key in FU.weaponCategories ? key : 'brawling';
}

function isRanged(range) {
	return ['distance', 'ranged'].includes(String(range ?? '').toLowerCase());
}

// ──────────────────────────────────────────────────────────────────────
// Format detection
// ──────────────────────────────────────────────────────────────────────

/**
 * @param {Object} data Parsed Fultimator JSON
 * @returns {"npc"|"character"|null} The actor type to create, or null when the JSON is not a supported export
 */
export function detectActorType(data) {
	if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
	const dataType = String(data.dataType ?? '').toLowerCase();
	if (dataType === 'npc') return 'npc';
	if (dataType === 'pc') return 'character';
	if (!dataType) {
		// Exports without a dataType: tell them apart by their characteristic fields
		if (Array.isArray(data.attacks) && 'species' in data) return 'npc';
		if (data.stats && data.info && 'attributes' in data) return 'character';
	}
	return null;
}

/**
 * @param {Object} data Parsed Fultimator JSON
 * @returns {FultimatorImport}
 * @throws {Error} When the JSON is not a supported Fultimator export
 */
export function mapFultimatorActor(data) {
	switch (detectActorType(data)) {
		case 'npc':
			return mapNpc(data);
		case 'character':
			return mapCharacter(data);
		default:
			throw new Error('Unsupported Fultimator export: expected an NPC or player character.');
	}
}

// ──────────────────────────────────────────────────────────────────────
// NPCs
// ──────────────────────────────────────────────────────────────────────

/**
 * @desc Reads the NPC skill options from either export format.
 */
function npcOptions(data) {
	const { features, extra = {}, derived, resources } = data;
	return {
		init: features ? !!features.init?.enabled : !!extra.init,
		precision: features ? !!features.precision?.enabled : !!extra.precision,
		magic: features ? !!features.magic?.enabled : !!extra.magic,
		extraInit: toNumber(derived ? derived.init?.bonus : extra.extrainit),
		def: toNumber(derived ? derived.def?.bonus : extra.def),
		mdef: toNumber(derived ? derived.mdef?.bonus : extra.mDef),
		hp: toNumber(resources ? resources.hp?.bonus : extra.hp),
		mp: toNumber(resources ? resources.mp?.bonus : extra.mp),
	};
}

function mapRank(rank) {
	const value = String(rank ?? 'soldier').toLowerCase();
	if (value.startsWith('champion')) {
		return { value: 'champion', replacedSoldiers: clamp(toNumber(value.replace('champion', ''), 1), 1, 6) };
	}
	return { value: value in FU.rank ? value : 'soldier' };
}

function mapSpecies(species, warnings) {
	const value = String(species ?? '')
		.toLowerCase()
		.replace(/^variant\s+/, '')
		.trim();
	if (value in FU.species) return value;
	warnings.push({ key: 'FU.FultimatorWarningSpecies', data: { species: String(species ?? '') } });
	return 'custom';
}

/**
 * @desc Basic attacks and weapon attacks share the same item shape.
 */
function npcAttackItem({ name, primary, secondary, accuracy, damage, element, hrZero, range, defense, description }) {
	const damageType = mapDamageType(element);
	return {
		type: 'basic',
		name,
		system: {
			attributes: itemAttributes(primary, secondary),
			accuracy: { value: accuracy },
			defense: defense in FU.defenses ? defense : 'def',
			damage: { value: damage },
			hasDamage: damageType !== null,
			damageType: { value: damageType ?? 'physical' },
			type: { value: isRanged(range) ? 'ranged' : 'melee' },
			rollInfo: { useWeapon: { hrZero: { value: !!hrZero } } },
			description: textToHtml(description),
		},
	};
}

function attackDescription(attack) {
	return attack.effect ?? (Array.isArray(attack.special) ? attack.special.join(' ') : '');
}

/**
 * @param {Object} data A Fultimator NPC export
 * @returns {FultimatorImport}
 */
export function mapNpc(data) {
	/** @type {FultimatorWarning[]} */
	const warnings = [];
	const options = npcOptions(data);
	const level = clamp(Math.round(toNumber(data.lvl, 5)), 5, 60);
	const rank = mapRank(data.rank);
	// Fultimator adds a companion's level to its accuracy and damage
	const companionBonus = rank.value === 'companion' ? toNumber(data.lvl, 1) : 0;
	const name = nameOr(data.name, 'Unnamed NPC');
	const img = mapImage(data.imgurl, warnings);

	const actor = {
		type: 'npc',
		name,
		...imageFields(img),
		system: {
			level: { value: level },
			rank,
			species: { value: mapSpecies(data.species, warnings) },
			villain: { value: ['minor', 'major', 'supreme'].includes(data.villain) ? data.villain : '' },
			phases: { value: Math.max(1, Math.round(toNumber(data.phases, 1))) },
			multipart: { value: String(data.multipart ?? '') },
			// Level bonuses are stored on the actor, as Project FU's role automation does, so they are not counted twice
			role: { value: data.role in FU.role ? data.role : 'custom' },
			traits: { value: String(data.traits ?? '') },
			attributes: mapAttributes(data.attributes, 'will', warnings),
			affinities: mapAffinities(data.affinities),
			immunities: Object.fromEntries(Object.keys(FU.temporaryEffects).map((status) => [status, { base: !!data.immunities?.[status] }])),
			resources: {
				hp: { bonus: Math.round(options.hp) },
				mp: { bonus: Math.round(options.mp) },
			},
			derived: {
				init: { bonus: (options.init ? 4 : 0) + options.extraInit },
				def: { bonus: options.def },
				mdef: { bonus: options.mdef },
			},
			bonuses: {
				accuracy: {
					accuracyCheck: Math.floor(level / 10) + (options.precision ? 3 : 0),
					magicCheck: Math.floor(level / 10) + (options.magic ? 3 : 0),
				},
				damage: {
					melee: Math.floor(level / 20) * 5,
					ranged: Math.floor(level / 20) * 5,
					spell: Math.floor(level / 20) * 5,
				},
			},
			description: textToHtml(data.description) + sectionsToHtml((data.notes ?? []).map((note) => ({ title: nameOr(note.name, 'Note'), text: note.effect }))),
		},
	};

	/** @type {FultimatorItemSpec[]} */
	const items = [];

	for (const attack of data.attacks ?? []) {
		items.push({
			data: npcAttackItem({
				name: nameOr(attack.name, 'Unnamed Attack'),
				primary: attack.accuracy?.attr1 ?? attack.attr1,
				secondary: attack.accuracy?.attr2 ?? attack.attr2,
				// v2 folds the flat bonuses into accuracy.value / damage.value; pre-v2 uses flathit / flatdmg
				accuracy: toNumber(attack.accuracy?.value ?? attack.flathit) + companionBonus,
				damage: 5 + (attack.extraDamage ? 5 : 0) + toNumber(attack.damage?.value ?? attack.flatdmg) + companionBonus,
				element: attack.damage?.type ?? attack.type,
				hrZero: attack.damage?.hrZero,
				range: attack.range,
				defense: attack.accuracy?.defense,
				description: attackDescription(attack),
			}),
		});
	}

	for (const attack of data.weaponattacks ?? []) {
		// Pre-v2 nests the weapon; v2 is flat, with accuracy.value / damage.value carrying the weapon's stats
		const weapon = attack.weapon;
		items.push({
			data: npcAttackItem({
				name: nameOr(attack.name, nameOr(weapon?.name, 'Unnamed Weapon Attack')),
				primary: attack.accuracy?.attr1 ?? weapon?.att1,
				secondary: attack.accuracy?.attr2 ?? weapon?.att2,
				accuracy: (weapon ? toNumber(weapon.prec) : toNumber(attack.accuracy?.value)) + toNumber(attack.flathit) + companionBonus,
				damage: (weapon ? toNumber(weapon.damage) : toNumber(attack.damage?.value)) + (attack.extraDamage ? 5 : 0) + toNumber(attack.flatdmg),
				element: attack.damage?.type ?? attack.type ?? weapon?.type,
				hrZero: attack.damage?.hrZero,
				range: weapon ? weapon.range : attack.range,
				defense: attack.accuracy?.defense,
				description: attackDescription(attack),
			}),
		});
	}

	for (const spell of data.spells ?? []) {
		items.push({ data: spellItem(spell, { accuracyBonus: companionBonus }) });
	}

	for (const action of data.actions ?? []) {
		items.push({ data: { type: 'miscAbility', name: nameOr(action.name, 'Unnamed Action'), system: { description: textToHtml(action.effect) } } });
	}

	for (const rule of [...(data.special ?? []), ...(data.raregear ?? [])]) {
		items.push({ data: { type: 'rule', name: nameOr(rule.name, 'Unnamed Rule'), system: { description: textToHtml(rule.effect) } } });
	}

	// Equipment is only listed by name, so it is taken from the compendium when available
	if (nameOr(data.armor?.name, '')) {
		items.push({ data: { type: 'armor', name: data.armor.name.trim() }, lookup: { type: 'armor', name: data.armor.name.trim() }, equip: 'armor', compendiumOnly: true });
	}
	if (nameOr(data.shield?.name, '')) {
		items.push({ data: { type: 'shield', name: data.shield.name.trim() }, lookup: { type: 'shield', name: data.shield.name.trim() }, equip: 'shield', compendiumOnly: true });
	}

	return { type: 'npc', actor, items, warnings };
}

/**
 * @param {Object} spell A Fultimator NPC or PC spell
 * @param {Object} [options]
 * @param {number} [options.accuracyBonus=0]
 * @param {string} [options.classFuid] The owning class, for player character spells
 * @returns {Object} Spell item data
 */
function spellItem(spell, { accuracyBonus = 0, classFuid } = {}) {
	// v2 renamed target -> targetDescription and replaced mp with a cost object
	const target = spell.targetDescription ?? spell.target ?? spell.targetDesc;
	const targeting = mapTargeting(target, spell.maxTargets);
	const cost = spell.cost?.amount !== undefined ? { amount: toNumber(spell.cost.amount), perTarget: !!spell.cost.perTarget } : parseMpCost(spell.mp);
	const isOffensive = !!(spell.isOffensive ?? spell.type === 'offensive');
	const damageType = mapDamageType(spell.damage?.type);
	const hasDamage = isOffensive && damageType !== null && toNumber(spell.damage?.value) > 0;
	return {
		type: 'spell',
		name: nameOr(spell.name ?? spell.spellName, 'Unnamed Spell'),
		system: {
			...(classFuid ? { class: { value: classFuid } } : {}),
			cost: { resource: 'mp', amount: String(cost.amount), perTarget: cost.perTarget || targeting.max > 1 },
			targeting,
			duration: { value: mapDuration(spell.duration) },
			isOffensive: { value: isOffensive },
			hasRoll: { value: isOffensive },
			defense: spell.accuracy?.defense in FU.defenses ? spell.accuracy.defense : 'mdef',
			rollInfo: {
				attributes: itemAttributes(spell.accuracy?.attr1 ?? spell.attr1 ?? 'ins', spell.accuracy?.attr2 ?? spell.attr2 ?? 'wlp'),
				accuracy: { value: toNumber(spell.accuracy?.value) + accuracyBonus },
				damage: {
					hasDamage: { value: hasDamage },
					value: hasDamage ? toNumber(spell.damage.value) : 0,
					type: { value: damageType ?? 'physical' },
				},
				useWeapon: { hrZero: { value: !!spell.damage?.hrZero } },
			},
			description: textToHtml(spell.effect ?? spell.description),
		},
	};
}

// ──────────────────────────────────────────────────────────────────────
// Player characters
// ──────────────────────────────────────────────────────────────────────

function mapBond(bond) {
	const feeling = (group) => Object.entries(BOND_FEELINGS[group]).find(([key]) => bond[key])?.[1] ?? '';
	return { name: String(bond.name ?? ''), admInf: feeling('admInf'), loyMis: feeling('loyMis'), affHat: feeling('affHat') };
}

/**
 * @desc Fultimator stores extra equipment modifiers that Project FU expresses as active effects; list them so nothing is lost.
 */
function equipmentModifierNotes(item) {
	const labels = {
		precModifier: 'Accuracy',
		magicModifier: 'Magic',
		damageMeleeModifier: 'Melee damage',
		damageRangedModifier: 'Ranged damage',
	};
	const lines = Object.entries(labels)
		.filter(([key]) => toNumber(item[key]) !== 0)
		.map(([key, label]) => `${label} ${toNumber(item[key]) > 0 ? '+' : ''}${toNumber(item[key])}`);
	return lines.length ? `<p><em>Fultimator modifiers (not automated): ${escapeHtml(lines.join(', '))}</em></p>` : '';
}

function equipmentBase(item) {
	return {
		cost: { value: Math.max(0, toNumber(item.cost)) },
		quality: { value: String(item.quality ?? '') },
		description: equipmentModifierNotes(item),
	};
}

function weaponItem(weapon) {
	const damageType = mapDamageType(weapon.type);
	return {
		type: 'weapon',
		name: nameOr(weapon.name, 'Unnamed Weapon'),
		system: {
			...equipmentBase(weapon),
			isMartial: { value: !!weapon.martial },
			category: { value: mapWeaponCategory(weapon.category) },
			type: { value: weapon.ranged || isRanged(weapon.range) ? 'ranged' : 'melee' },
			hands: { value: toNumber(weapon.hands, 1) >= 2 ? 'two-handed' : 'one-handed' },
			attributes: itemAttributes(weapon.att1, weapon.att2),
			// Fultimator saves the final accuracy and damage, including its own bonuses and modifiers
			accuracy: { value: toNumber(weapon.prec) },
			damage: { value: toNumber(weapon.damage) },
			hasDamage: damageType !== null,
			damageType: { value: damageType ?? 'physical' },
			def: { value: toNumber(weapon.defModifier) },
			mdef: { value: toNumber(weapon.mDefModifier) },
		},
	};
}

function armorItem(armor) {
	const martial = !!armor.martial;
	return {
		type: 'armor',
		name: nameOr(armor.name, 'Unnamed Armor'),
		system: {
			...equipmentBase(armor),
			isMartial: { value: martial },
			// As in the core rules, martial armor has a flat DEF while other armor adds to the DEX die
			def: { attribute: martial ? '' : 'dex', value: toNumber(armor.def) + toNumber(armor.defModifier) },
			mdef: { attribute: 'ins', value: toNumber(armor.mdef) + toNumber(armor.mDefModifier) },
			init: { value: toNumber(armor.init) + toNumber(armor.initModifier) },
		},
	};
}

function shieldItem(shield) {
	return {
		type: 'shield',
		name: nameOr(shield.name, 'Unnamed Shield'),
		system: {
			...equipmentBase(shield),
			isMartial: { value: !!shield.martial },
			def: { value: toNumber(shield.def) + toNumber(shield.defModifier) },
			mdef: { value: toNumber(shield.mdef) + toNumber(shield.mDefModifier) },
			init: { value: toNumber(shield.init) + toNumber(shield.initModifier) },
		},
	};
}

function accessoryItem(accessory) {
	return {
		type: 'accessory',
		name: nameOr(accessory.name, 'Unnamed Accessory'),
		system: {
			...equipmentBase(accessory),
			def: { value: toNumber(accessory.defModifier) },
			mdef: { value: toNumber(accessory.mDefModifier) },
			init: { value: toNumber(accessory.initModifier) },
		},
	};
}

function classItems(fultimatorClass, warnings) {
	const name = nameOr(fultimatorClass.name, 'Unnamed Class');
	const fuid = slugify(name);
	const benefits = fultimatorClass.benefits ?? {};
	const flag = (value) => ({ value: !!value });
	/** @type {FultimatorItemSpec[]} */
	const items = [
		{
			lookup: { type: 'class', name },
			data: {
				type: 'class',
				name,
				system: {
					fuid,
					benefits: {
						resources: { hp: flag(benefits.hpplus > 0), mp: flag(benefits.mpplus > 0), ip: flag(benefits.ipplus > 0) },
						martials: Object.fromEntries(['melee', 'ranged', 'armor', 'shields'].map((key) => [key, flag(benefits.martials?.[key])])),
						rituals: Object.fromEntries(['arcanism', 'chimerism', 'elementalism', 'entropism', 'ritualism', 'spiritism'].map((key) => [key, flag(benefits.rituals?.[key])])),
					},
				},
			},
		},
	];

	// A class's level is the sum of its skill levels, linked through the class fuid
	for (const skill of fultimatorClass.skills ?? []) {
		const level = toNumber(skill.currentLvl);
		const skillName = nameOr(skill.skillName, '');
		if (!skillName || level <= 0) continue;
		const levelData = { value: level, max: Math.max(1, toNumber(skill.maxLvl, 1), level), min: 0 };
		items.push({
			lookup: { type: 'skill', name: skillName, classFuid: fuid },
			overrides: { system: { level: levelData, class: { value: fuid } } },
			data: { type: 'skill', name: skillName, system: { fuid: slugify(skillName), level: levelData, class: { value: fuid }, description: textToHtml(skill.description) } },
		});
	}

	const heroicName = nameOr(fultimatorClass.heroic?.name, '');
	if (heroicName) {
		items.push({
			lookup: { type: 'heroic', name: heroicName },
			overrides: { system: { class: { value: fuid } } },
			data: { type: 'heroic', name: heroicName, system: { subtype: { value: 'skill' }, class: { value: fuid }, description: textToHtml(fultimatorClass.heroic.description) } },
		});
	}

	for (const spell of fultimatorClass.spells ?? []) {
		if (!PLAIN_SPELL_TYPES.has(spell.spellType)) {
			warnings.push({ key: 'FU.FultimatorWarningClassFeature', data: { name: nameOr(spell.name ?? spell.spellName, spell.spellType), class: name } });
			continue;
		}
		const data = spellItem(spell, { classFuid: fuid });
		items.push({ lookup: { type: 'spell', name: data.name, classFuid: fuid }, overrides: { system: { class: { value: fuid } } }, data });
	}
	return items;
}

/**
 * @param {Object} data A Fultimator player character export
 * @returns {FultimatorImport}
 */
export function mapCharacter(data) {
	/** @type {FultimatorWarning[]} */
	const warnings = [];
	const info = data.info ?? {};
	const stats = data.stats ?? {};
	const modifiers = data.modifiers ?? {};
	const name = nameOr(data.name, 'Unnamed Character');
	const img = mapImage(data.imgurl ?? info.imgurl, warnings);
	const quirk = data.quirk?.name ? [{ title: `Quirk: ${data.quirk.name}`, text: [data.quirk.description, data.quirk.effect].filter(Boolean).join('\n\n') }] : [];
	const notes = (data.notes ?? []).map((note) => ({ title: nameOr(note.name, 'Note'), text: note.description }));

	const actor = {
		type: 'character',
		name,
		...imageFields(img),
		system: {
			level: { value: clamp(Math.round(toNumber(data.lvl, 5)), 5, 50) },
			attributes: mapAttributes(data.attributes, 'willpower', warnings),
			...(data.affinities ? { affinities: mapAffinities(data.affinities) } : {}),
			resources: {
				hp: { value: Math.max(0, toNumber(stats.hp?.current)), bonus: Math.max(0, toNumber(modifiers.hp)) },
				mp: { value: Math.max(0, toNumber(stats.mp?.current)), bonus: Math.max(0, toNumber(modifiers.mp)) },
				ip: { value: Math.max(0, toNumber(stats.ip?.current)), bonus: Math.max(0, toNumber(modifiers.ip)) },
				fp: { value: Math.max(0, toNumber(info.fabulapoints)) },
				exp: { value: Math.max(0, toNumber(info.exp)) },
				zenit: { value: Math.max(0, toNumber(info.zenit)) },
				identity: { name: String(info.identity ?? '') },
				pronouns: { name: String(info.pronouns ?? '') },
				theme: { name: String(info.theme ?? '') },
				origin: { name: String(info.origin ?? '') },
			},
			derived: {
				def: { bonus: toNumber(modifiers.def) },
				mdef: { bonus: toNumber(modifiers.mdef) },
				init: { bonus: toNumber(modifiers.init) },
			},
			bonuses: {
				accuracy: {
					accuracyMelee: toNumber(modifiers.meleePrec),
					accuracyRanged: toNumber(modifiers.rangedPrec),
					magicCheck: toNumber(modifiers.magicPrec),
				},
			},
			bonds: (info.bonds ?? []).map(mapBond),
			description: textToHtml(info.description) + sectionsToHtml([...quirk, ...notes]),
		},
	};

	/** @type {FultimatorItemSpec[]} */
	const items = [];
	for (const fultimatorClass of data.classes ?? []) {
		items.push(...classItems(fultimatorClass, warnings));
	}
	for (const weapon of data.weapons ?? []) {
		items.push({ data: weaponItem(weapon), ...(weapon.isEquipped ? { equip: 'weapon' } : {}) });
	}
	for (const armor of data.armor ?? []) {
		items.push({ data: armorItem(armor), ...(armor.isEquipped ? { equip: 'armor' } : {}) });
	}
	for (const shield of data.shields ?? []) {
		items.push({ data: shieldItem(shield), ...(shield.isEquipped ? { equip: 'shield' } : {}) });
	}
	for (const accessory of data.accessories ?? []) {
		items.push({ data: accessoryItem(accessory), ...(accessory.isEquipped ? { equip: 'accessory' } : {}) });
	}
	for (const item of data.items ?? []) {
		items.push({
			data: {
				type: 'treasure',
				name: nameOr(item.name, 'Unnamed Item'),
				system: { cost: { value: Math.max(0, toNumber(item.value)) }, quantity: { value: Math.max(0, toNumber(item.quantity, 1)) }, description: textToHtml(item.description) },
			},
		});
	}
	for (const consumable of data.consumables ?? []) {
		items.push({
			data: { type: 'consumable', name: nameOr(consumable.name, 'Unnamed Consumable'), system: { ipCost: { value: Math.max(0, toNumber(consumable.ipCost, 3)) }, description: textToHtml(consumable.description) } },
		});
	}
	for (const weapon of data.customWeapons ?? []) {
		warnings.push({ key: 'FU.FultimatorWarningCustomWeapon', data: { name: nameOr(weapon.name, 'Unnamed Weapon') } });
	}

	return { type: 'character', actor, items, warnings };
}
