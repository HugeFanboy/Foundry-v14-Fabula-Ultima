import { describe, it, expect } from 'vitest';
import { detectActorType, mapFultimatorActor, mapNpc, mapCharacter, mapAffinity, mapDamageType, mapTargeting, parseMpCost, textToHtml } from '../module/integration/fultimator/fultimator-mapper.mjs';

const legacyNpc = {
	dataType: 'npc',
	name: 'Red Fang',
	lvl: 25,
	species: 'Beast',
	rank: 'champion2',
	villain: 'minor',
	imgurl: 'https://example.com/red-fang.png?size=large',
	attributes: { dexterity: 10, insight: 6, might: 10, will: 8 },
	affinities: { physical: 'rs', wind: 'vu', fire: 'im', ice: 'ab' },
	immunities: { poisoned: true },
	extra: { init: true, precision: true, hp: '10', mp: '20', def: 1, mDef: 2, extrainit: '1' },
	attacks: [{ name: 'Bite', range: 'melee', attr1: 'dexterity', attr2: 'might', type: 'physical', extraDamage: true, flathit: '1', flatdmg: 2, special: ['Poisons the target.'] }],
	weaponattacks: [{ name: 'Claw Swipe', weapon: { name: 'Claw', prec: 1, damage: 10, att1: 'might', att2: 'might', range: 'distance', type: 'fire' }, flathit: 1 }],
	spells: [{ name: 'Fireball', type: 'offensive', attr1: 'insight', attr2: 'will', mp: '10 x T', maxTargets: 3, target: 'Up to three creatures', duration: 'Instantaneous', effect: 'Deals **fire** damage.' }],
	actions: [{ name: 'Howl', effect: 'Calls the pack.' }],
	special: [{ name: 'Pack Hunter', effect: 'Gains +2 against isolated targets.' }],
	notes: [{ name: 'Lore', effect: 'Lives in the north.' }],
	armor: { name: 'Bronze Plate' },
	shield: { name: '' },
};

const v2Npc = {
	dataType: 'npc',
	schemaVersion: 2,
	name: 'Clockwork Sentry',
	lvl: 10,
	species: 'Construct',
	rank: 'elite',
	role: 'sentinel',
	attributes: { dexterity: { base: 8 }, insight: { base: 8 }, might: { base: 12 }, will: { base: 6 } },
	affinities: { air: 'vu', bolt: 'vu', earth: 'rs' },
	features: { init: { enabled: false }, precision: { enabled: false }, magic: { enabled: true } },
	derived: { def: { bonus: 2 }, mdef: { bonus: 0 }, init: { bonus: 0 } },
	resources: { hp: { bonus: 5 }, mp: { bonus: 0 } },
	attacks: [{ name: 'Gear Slam', range: 'melee', accuracy: { attr1: 'might', attr2: 'might', value: 2, defense: 'def' }, damage: { value: 3, type: 'nodmg' } }],
	weaponattacks: [{ name: 'Rifle Shot', range: 'ranged', accuracy: { attr1: 'dexterity', attr2: 'insight', value: 1 }, damage: { value: 12, type: 'physical', hrZero: true } }],
	spells: [
		{
			name: 'Arc Bolt',
			isOffensive: true,
			accuracy: { attr1: 'insight', attr2: 'will', value: 0, defense: 'mdef' },
			damage: { value: 15, type: 'bolt' },
			cost: { amount: 10, perTarget: false },
			targetDescription: 'One creature',
			duration: 'Instantaneous',
		},
	],
};

const character = {
	dataType: 'pc',
	name: 'Lyra',
	lvl: 7,
	info: {
		pronouns: 'she/her',
		identity: 'Wandering Scholar',
		theme: 'Duty',
		origin: 'Arkenton',
		fabulapoints: 4,
		exp: 3,
		zenit: 350,
		description: 'A curious mind.',
		bonds: [{ name: 'Mentor', admiration: true, loyality: true, hatred: false, inferiority: false, mistrust: false, affection: false }],
	},
	stats: { hp: { current: 40, max: 50 }, mp: { current: 45, max: 45 }, ip: { current: 6, max: 6 } },
	attributes: { dexterity: 8, insight: 10, might: 6, willpower: 10 },
	modifiers: { hp: 0, mp: 5, ip: 0, def: 1, mdef: 0, init: 0, meleePrec: 0, rangedPrec: 1, magicPrec: 2 },
	classes: [
		{
			name: 'Elementalist',
			lvl: 5,
			benefits: { hpplus: 0, mpplus: 5, ipplus: 0, martials: { melee: false, ranged: false, armor: false, shields: false }, rituals: { ritualism: false, elementalism: true } },
			skills: [
				{ skillName: 'Elemental Magic', currentLvl: 4, maxLvl: 10, description: 'Learn spells.' },
				{ skillName: 'Cataclysm', currentLvl: 1, maxLvl: 5, description: '' },
				{ skillName: 'Unlearned Skill', currentLvl: 0, maxLvl: 1, description: '' },
			],
			spells: [
				{
					spellName: 'Fulgur',
					mp: '10 x T',
					maxTargets: 3,
					targetDesc: 'Up to three creatures',
					duration: 'Instantaneous',
					isOffensive: true,
					attr1: 'insight',
					attr2: 'willpower',
					description: 'Bolt damage.',
					spellType: 'default',
				},
				{ name: 'Arcanum of the Forge', spellType: 'arcanist' },
			],
		},
	],
	weapons: [
		{ name: 'Iron Hammer', category: 'Heavy', melee: true, ranged: false, type: 'physical', hands: 2, att1: 'might', att2: 'might', martial: true, quality: '', cost: 200, damage: 10, prec: 0, isEquipped: true },
		{ name: 'Crossbow', category: 'Bow', melee: false, ranged: true, type: 'physical', hands: 2, att1: 'dexterity', att2: 'insight', martial: false, quality: '', cost: 150, damage: 8, prec: 0 },
	],
	armor: [{ name: 'Silk Shirt', def: 0, mdef: 2, init: -1, martial: false, quality: '', cost: 100, isEquipped: true, defModifier: 1, precModifier: 1 }],
	shields: [],
	accessories: [{ name: 'Lucky Charm', defModifier: 0, mDefModifier: 1, quality: 'Luck', cost: 300, isEquipped: true }],
	items: [{ name: 'Old Map', description: 'Of the ruins.', value: 10, quantity: 2 }],
	customWeapons: [{ name: 'Transforming Blade' }],
	notes: [{ name: 'Goal', description: 'Find the lost library.' }],
	quirk: { name: 'Night Owl', description: 'Awake at night.', effect: '+1 at night.' },
};

describe('detectActorType', () => {
	it('uses the dataType field', () => {
		expect(detectActorType(legacyNpc)).toBe('npc');
		expect(detectActorType(character)).toBe('character');
	});

	it('falls back to characteristic fields when dataType is missing', () => {
		const npc = { ...legacyNpc, dataType: undefined };
		const pc = { ...character, dataType: undefined };
		expect(detectActorType(npc)).toBe('npc');
		expect(detectActorType(pc)).toBe('character');
	});

	it('rejects unsupported exports', () => {
		expect(detectActorType({ dataType: 'weapon', name: 'Sword' })).toBeNull();
		expect(detectActorType([])).toBeNull();
		expect(() => mapFultimatorActor({ dataType: 'armor' })).toThrow();
	});
});

describe('value mapping', () => {
	it('maps affinities from codes and numbers', () => {
		expect(mapAffinity('VU')).toBe(-1);
		expect(mapAffinity('rs')).toBe(1);
		expect(mapAffinity('im')).toBe(2);
		expect(mapAffinity('ab')).toBe(3);
		expect(mapAffinity('')).toBe(0);
		expect(mapAffinity(2)).toBe(2);
		expect(mapAffinity(9)).toBe(0);
	});

	it('maps damage types, including wind and no damage', () => {
		expect(mapDamageType('wind')).toBe('air');
		expect(mapDamageType('Fire')).toBe('fire');
		expect(mapDamageType('nodmg')).toBeNull();
		expect(mapDamageType('unknown')).toBe('physical');
	});

	it('parses MP costs', () => {
		expect(parseMpCost('10 x T')).toEqual({ amount: 10, perTarget: true });
		expect(parseMpCost('20')).toEqual({ amount: 20, perTarget: false });
		expect(parseMpCost(5)).toEqual({ amount: 5, perTarget: false });
		expect(parseMpCost(undefined)).toEqual({ amount: 0, perTarget: false });
	});

	it('maps targets', () => {
		expect(mapTargeting('Self')).toEqual({ rule: 'self', max: 0 });
		expect(mapTargeting('Up to three creatures')).toEqual({ rule: 'multiple', max: 3 });
		expect(mapTargeting('One creature')).toEqual({ rule: 'single', max: 1 });
		expect(mapTargeting('', 2)).toEqual({ rule: 'multiple', max: 2 });
	});

	it('escapes HTML and converts light Markdown', () => {
		expect(textToHtml('**Bold** and *it*\nnext\n\n<script>x</script>')).toBe('<p><strong>Bold</strong> and <em>it</em><br>next</p><p>&lt;script&gt;x&lt;/script&gt;</p>');
		expect(textToHtml(undefined)).toBe('');
	});
});

describe('mapNpc (pre-v2 export)', () => {
	const result = mapNpc(legacyNpc);
	const system = result.actor.system;

	it('maps the actor', () => {
		expect(result.type).toBe('npc');
		expect(result.actor.name).toBe('Red Fang');
		expect(result.actor.img).toBe('https://example.com/red-fang.png?size=large');
		expect(system.level.value).toBe(25);
		expect(system.species.value).toBe('beast');
		expect(system.rank).toEqual({ value: 'champion', replacedSoldiers: 2 });
		expect(system.villain.value).toBe('minor');
		expect(system.role.value).toBe('custom');
		expect(system.attributes).toEqual({ dex: { base: 10 }, ins: { base: 6 }, mig: { base: 10 }, wlp: { base: 8 } });
		expect(system.affinities.physical.base).toBe(1);
		expect(system.affinities.air.base).toBe(-1);
		expect(system.affinities.fire.base).toBe(2);
		expect(system.affinities.ice.base).toBe(3);
		expect(system.affinities.bolt.base).toBe(0);
		expect(system.immunities.poisoned.base).toBe(true);
		expect(system.immunities.slow.base).toBe(false);
		expect(system.resources).toEqual({ hp: { bonus: 10 }, mp: { bonus: 20 } });
		expect(system.derived).toEqual({ init: { bonus: 5 }, def: { bonus: 1 }, mdef: { bonus: 2 } });
		expect(system.bonuses.accuracy).toEqual({ accuracyCheck: 5, magicCheck: 2 });
		expect(system.bonuses.damage.melee).toBe(5);
		expect(system.description).toContain('<h3>Lore</h3>');
	});

	it('maps attacks with flat bonuses and extra damage', () => {
		const bite = result.items.find((item) => item.data.name === 'Bite').data;
		expect(bite.type).toBe('basic');
		expect(bite.system.attributes).toEqual({ primary: { value: 'dex' }, secondary: { value: 'mig' } });
		expect(bite.system.accuracy.value).toBe(1);
		expect(bite.system.damage.value).toBe(12);
		expect(bite.system.type.value).toBe('melee');
		expect(bite.system.description).toBe('<p>Poisons the target.</p>');

		const claw = result.items.find((item) => item.data.name === 'Claw Swipe').data;
		expect(claw.system.accuracy.value).toBe(2);
		expect(claw.system.damage.value).toBe(10);
		expect(claw.system.type.value).toBe('ranged');
		expect(claw.system.damageType.value).toBe('fire');
	});

	it('maps spells, actions, rules and equipment', () => {
		const fireball = result.items.find((item) => item.data.name === 'Fireball').data;
		expect(fireball.system.cost).toEqual({ resource: 'mp', amount: '10', perTarget: true });
		expect(fireball.system.targeting).toEqual({ rule: 'multiple', max: 3 });
		expect(fireball.system.isOffensive.value).toBe(true);
		expect(fireball.system.rollInfo.attributes).toEqual({ primary: { value: 'ins' }, secondary: { value: 'wlp' } });
		expect(result.items.find((item) => item.data.name === 'Howl').data.type).toBe('miscAbility');
		expect(result.items.find((item) => item.data.name === 'Pack Hunter').data.type).toBe('rule');
		const armor = result.items.find((item) => item.data.type === 'armor');
		expect(armor).toMatchObject({ lookup: { type: 'armor', name: 'Bronze Plate' }, equip: 'armor', compendiumOnly: true });
		expect(result.items.some((item) => item.data.type === 'shield')).toBe(false);
	});
});

describe('mapNpc (v2 export)', () => {
	const result = mapNpc(v2Npc);
	const system = result.actor.system;

	it('reads nested attribute dice and v2 options', () => {
		expect(system.attributes.mig.base).toBe(12);
		expect(system.role.value).toBe('sentinel');
		expect(system.rank).toEqual({ value: 'elite' });
		expect(system.affinities.air.base).toBe(-1);
		expect(system.resources.hp.bonus).toBe(5);
		expect(system.derived.def.bonus).toBe(2);
		expect(system.bonuses.accuracy).toEqual({ accuracyCheck: 1, magicCheck: 4 });
	});

	it('maps v2 attacks', () => {
		const slam = result.items.find((item) => item.data.name === 'Gear Slam').data;
		expect(slam.system.hasDamage).toBe(false);
		expect(slam.system.accuracy.value).toBe(2);
		const shot = result.items.find((item) => item.data.name === 'Rifle Shot').data;
		expect(shot.system.damage.value).toBe(12);
		expect(shot.system.type.value).toBe('ranged');
		expect(shot.system.rollInfo.useWeapon.hrZero.value).toBe(true);
	});

	it('maps v2 spell damage and cost', () => {
		const spell = result.items.find((item) => item.data.name === 'Arc Bolt').data;
		expect(spell.system.rollInfo.damage).toEqual({ hasDamage: { value: true }, value: 15, type: { value: 'bolt' } });
		expect(spell.system.cost.amount).toBe('10');
		expect(spell.system.targeting).toEqual({ rule: 'single', max: 1 });
		expect(spell.system.defense).toBe('mdef');
	});
});

describe('mapNpc edge cases', () => {
	it('clamps levels and falls back for invalid values', () => {
		const result = mapNpc({ dataType: 'npc', name: '', lvl: 2, species: 'Dragon', attributes: { dexterity: 7, insight: 8, might: 8, will: 8 }, affinities: {}, attacks: [], phases: '0', imgurl: 'https://example.com/portrait' });
		expect(result.actor.name).toBe('Unnamed NPC');
		expect(result.actor.system.level.value).toBe(5);
		expect(result.actor.system.phases.value).toBe(1);
		expect(result.actor.system.species.value).toBe('custom');
		expect(result.actor.system.attributes.dex.base).toBe(8);
		expect(result.actor.img).toBeUndefined();
		expect(result.warnings.map((warning) => warning.key)).toEqual(['FU.FultimatorWarningImage', 'FU.FultimatorWarningSpecies', 'FU.FultimatorWarningAttribute']);
	});

	it('adds the companion level to accuracy and damage', () => {
		const result = mapNpc({ ...legacyNpc, rank: 'companion', lvl: 3 });
		const bite = result.items.find((item) => item.data.name === 'Bite').data;
		expect(result.actor.system.rank).toEqual({ value: 'companion' });
		expect(bite.system.accuracy.value).toBe(4);
		expect(bite.system.damage.value).toBe(15);
	});
});

describe('mapCharacter', () => {
	const result = mapCharacter(character);
	const system = result.actor.system;

	it('maps the actor', () => {
		expect(result.type).toBe('character');
		expect(system.level.value).toBe(7);
		expect(system.attributes.wlp.base).toBe(10);
		expect(system.resources.hp).toEqual({ value: 40, bonus: 0 });
		expect(system.resources.mp).toEqual({ value: 45, bonus: 5 });
		expect(system.resources.fp.value).toBe(4);
		expect(system.resources.zenit.value).toBe(350);
		expect(system.resources.identity.name).toBe('Wandering Scholar');
		expect(system.derived.def.bonus).toBe(1);
		expect(system.bonuses.accuracy).toEqual({ accuracyMelee: 0, accuracyRanged: 1, magicCheck: 2 });
		expect(system.bonds).toEqual([{ name: 'Mentor', admInf: 'admiration', loyMis: 'loyalty', affHat: '' }]);
		expect(system.description).toContain('<h3>Quirk: Night Owl</h3>');
		expect(system.description).toContain('<h3>Goal</h3>');
	});

	it('links skills to their class so the class level is the sum of skill levels', () => {
		const classSpec = result.items.find((item) => item.data.type === 'class');
		expect(classSpec.lookup).toEqual({ type: 'class', name: 'Elementalist' });
		expect(classSpec.data.system.fuid).toBe('elementalist');
		expect(classSpec.data.system.benefits.resources.mp.value).toBe(true);
		expect(classSpec.data.system.benefits.rituals.elementalism.value).toBe(true);

		const skills = result.items.filter((item) => item.data.type === 'skill');
		expect(skills.map((skill) => skill.data.name)).toEqual(['Elemental Magic', 'Cataclysm']);
		expect(skills[0].lookup).toEqual({ type: 'skill', name: 'Elemental Magic', classFuid: 'elementalist' });
		expect(skills[0].overrides.system).toEqual({ level: { value: 4, max: 10, min: 0 }, class: { value: 'elementalist' } });
		expect(skills.reduce((sum, skill) => sum + skill.data.system.level.value, 0)).toBe(5);
	});

	it('imports plain spells and reports class features', () => {
		const spell = result.items.find((item) => item.data.type === 'spell');
		expect(spell.data.name).toBe('Fulgur');
		expect(spell.data.system.class.value).toBe('elementalist');
		expect(spell.data.system.cost).toEqual({ resource: 'mp', amount: '10', perTarget: true });
		expect(result.warnings).toContainEqual({ key: 'FU.FultimatorWarningClassFeature', data: { name: 'Arcanum of the Forge', class: 'Elementalist' } });
		expect(result.warnings).toContainEqual({ key: 'FU.FultimatorWarningCustomWeapon', data: { name: 'Transforming Blade' } });
	});

	it('maps equipment and marks equipped items', () => {
		const hammer = result.items.find((item) => item.data.name === 'Iron Hammer');
		expect(hammer.equip).toBe('weapon');
		expect(hammer.data.system).toMatchObject({ category: { value: 'heavy' }, hands: { value: 'two-handed' }, type: { value: 'melee' }, damage: { value: 10 }, isMartial: { value: true } });
		const crossbow = result.items.find((item) => item.data.name === 'Crossbow');
		expect(crossbow.equip).toBeUndefined();
		expect(crossbow.data.system.type.value).toBe('ranged');

		const shirt = result.items.find((item) => item.data.name === 'Silk Shirt');
		expect(shirt.equip).toBe('armor');
		expect(shirt.data.system.def).toEqual({ attribute: 'dex', value: 1 });
		expect(shirt.data.system.mdef).toEqual({ attribute: 'ins', value: 2 });
		expect(shirt.data.system.init.value).toBe(-1);
		expect(shirt.data.system.description).toContain('Accuracy +1');

		const charm = result.items.find((item) => item.data.name === 'Lucky Charm');
		expect(charm.equip).toBe('accessory');
		expect(charm.data.system.mdef.value).toBe(1);

		const map = result.items.find((item) => item.data.name === 'Old Map').data;
		expect(map.type).toBe('treasure');
		expect(map.system.quantity.value).toBe(2);
	});
});
