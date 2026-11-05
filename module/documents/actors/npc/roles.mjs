/**
 * The following abstractions can be remodeled or folded into
 * a general one adopted by the system at a later date;
 * at the time of writing this was the simplest approach I could make.
 */

/**
 * An array of the 4 attributes used by a character in the system.
 */
export class AttributeArray {
	/**
	 * Constructs an array of the 4 attributes used by a character in the system
	 * @param {Number} dex
	 * @param {Number} ins
	 * @param {Number} mig
	 * @param {Number} wlp
	 */
	constructor(dex, ins, mig, wlp) {
		this._dex = dex;
		this._ins = ins;
		this._mig = mig;
		this._wlp = wlp;
	}

	get dex() {
		return this._dex;
	}

	get mig() {
		return this._mig;
	}

	get ins() {
		return this._ins;
	}

	get wlp() {
		return this._wlp;
	}
}

/**
 * Model for an NPC role, which determines its attributes, skills, etc.
 */
export class Role {
	/**
	 * @param {*} attributeSteps The attributes for each step in advancement
	 */
	constructor(attributeSteps) {
		this.attributeSteps = attributeSteps;
	}

	/**
	 * @param {Number} level
	 * @returns {AttributeArray} The atttibutes for that level
	 */
	getAttributesForLevel(level) {
		// There's steps at levels: BASE, 20, 40, 60
		const step = Math.floor(level / 20);
		console.info(`Getting attributes for level ${level}, step ${step}`);
		return this.attributeSteps[step];
	}

	/**
	 * @param {RoleType} roleType
	 * @returns {Role}
	 */
	static resolve(roleType) {
		switch (roleType) {
			case 'brute':
				return this.brute;
			case 'hunter':
				return this.hunter;
			case 'mage':
				return this.mage;
			case 'saboteur':
				return this.saboteur;
			case 'sentinel':
				return this.sentinel;
			case 'support':
				return this.support;
		}
		return null;
	}

	static get brute() {
		const attributeSteps = {};
		attributeSteps[0] = new AttributeArray(8, 6, 10, 8);
		attributeSteps[1] = new AttributeArray(8, 8, 10, 8);
		attributeSteps[2] = new AttributeArray(8, 8, 12, 8);
		attributeSteps[3] = new AttributeArray(8, 8, 12, 10);
		const role = new Role(attributeSteps);
		return role;
	}

	static get hunter() {
		const attributeSteps = {};
		attributeSteps[0] = new AttributeArray(10, 8, 8, 6);
		attributeSteps[1] = new AttributeArray(10, 8, 8, 8);
		attributeSteps[2] = new AttributeArray(12, 8, 8, 8);
		attributeSteps[3] = new AttributeArray(12, 10, 8, 8);
		const role = new Role(attributeSteps);
		return role;
	}

	static get mage() {
		const attributeSteps = {};
		attributeSteps[0] = new AttributeArray(8, 8, 6, 10);
		attributeSteps[1] = new AttributeArray(8, 10, 6, 10);
		attributeSteps[2] = new AttributeArray(8, 10, 6, 12);
		attributeSteps[3] = new AttributeArray(8, 10, 8, 12);
		const role = new Role(attributeSteps);
		return role;
	}

	static get saboteur() {
		const attributeSteps = {};
		attributeSteps[0] = new AttributeArray(8, 8, 8, 8);
		attributeSteps[1] = new AttributeArray(8, 8, 8, 10);
		attributeSteps[2] = new AttributeArray(8, 10, 8, 10);
		attributeSteps[3] = new AttributeArray(10, 10, 8, 10);
		const role = new Role(attributeSteps);
		return role;
	}

	static get sentinel() {
		const attributeSteps = {};
		attributeSteps[0] = new AttributeArray(8, 8, 8, 8);
		attributeSteps[1] = new AttributeArray(8, 8, 10, 8);
		attributeSteps[2] = new AttributeArray(8, 8, 10, 10);
		attributeSteps[3] = new AttributeArray(10, 8, 10, 10);
		const role = new Role(attributeSteps);
		return role;
	}

	static get support() {
		const attributeSteps = {};
		attributeSteps[0] = new AttributeArray(8, 8, 6, 10);
		attributeSteps[1] = new AttributeArray(8, 10, 6, 10);
		attributeSteps[2] = new AttributeArray(8, 10, 8, 10);
		attributeSteps[3] = new AttributeArray(8, 12, 8, 10);
		const role = new Role(attributeSteps);
		return role;
	}
}
