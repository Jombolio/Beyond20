

const fvtt_isNewer = foundry && foundry.utils && foundry.utils.isNewerVersion ? foundry.utils.isNewerVersion : isNewerVersion;
const fvtt_Die = foundry && foundry.dice && foundry.dice.terms && foundry.dice.terms.Die ? foundry.dice.terms.Die : Die;
const fvtt_PoolTerm = foundry && foundry.dice && foundry.dice.terms && foundry.dice.terms.PoolTerm ? foundry.dice.terms.PoolTerm : PoolTerm;
// Foundry 14 removed the bare globals for these helpers. The right-hand side is only reached on
// versions that still have them, so naming them here doesn't throw on 14.
const fvtt_duplicate = foundry && foundry.utils && foundry.utils.duplicate ? foundry.utils.duplicate : duplicate;
const fvtt_mergeObject = foundry && foundry.utils && foundry.utils.mergeObject ? foundry.utils.mergeObject : mergeObject;
const fvtt_randomID = foundry && foundry.utils && foundry.utils.randomID ? foundry.utils.randomID : randomID;

class Beyond20 {
    static getMyActor() {
        return game.actors.find(a => a.isOwner && a.getFlag("beyond20", "user") === (game.user?.id || game.userId));
    }
    static async getUpdatedActor(request, items=[]) {
        const actorData = await this.createActorData(request, items);
        const existing = this.getMyActor();
        if (existing) {
            await existing.update(actorData, {diff: false, recursive: false});
            return existing;
        } else {
            const actor = await Actor.create(actorData);
            return actor;
        }
    }

    /**
     * Default system data for a document type. dnd5e stopped shipping template.json and Foundry 14
     * removed game.system.template, so this asks the data model for its own defaults instead.
     */
    static _getDefaultTemplate(entityType, templateType) {
        const cls = entityType === "Actor" ? Actor : Item;
        const documentClass = cls.implementation || cls;
        return new documentClass({ name: "Beyond20", type: templateType }).toObject().system;
    }

    static async createActorData(request, initialItems=[]) {
        const type = request.character.type == "Character" ? "character" : "npc";
        // get default actor template
        const actorData = this._getDefaultTemplate('Actor', type);
        const baseAttributes = {
            name: request.character.name || request.name,
            type,
            flags: {
                beyond20: {
                    user: game.user.id
                }
            },
        };
        // In v10, permission field was changed into ownership
        if (fvtt_isNewer(game.version || game.data.version, "10")) {
            baseAttributes["ownership"] = {
                [game.user?.id || game.userId]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER
            }
        } else {
            baseAttributes["permission"] = {
                [game.user?.id || game.userId]: CONST.DOCUMENT_PERMISSION_LEVELS.OWNER
            }
        }
        if (!["Character", "Monster", "Creature"].includes(request.character.type)) {
            return {...baseAttributes, img: "icons/svg/mystery-man.svg", system: actorData, items: []}
        }
        for (let ability of request.character.abilities) {
            const [name, abbr, score, mod] = ability;
            actorData.abilities[abbr.toLowerCase()] = {value: parseInt(score), mod: parseInt(mod)}
        }
        actorData.attributes.ac.flat = parseInt(request.character.ac);
        actorData.attributes.ac.calc = "flat";
        actorData.attributes.hp.value = parseInt(request.character.hp);
        actorData.attributes.hp.max = parseInt(request.character['max-hp']);
        actorData.attributes.hp.temp = parseInt(request.character['temp-hp']);
        if (type === "npc") {
            const cr = request.character.cr;
            const parseCR = (cr) => {
                const match = cr.match(/([0-9]+)\/([0-9]+)/);
                return (parseInt(match[1]) || 0) / (parseInt(match[2] || 1));
            }
            actorData.details.cr = parseFloat(cr.includes("/") ? parseCR(cr) : parseInt(cr));
            // Calculate Proficiency (Formula from D&D 5e system)
            actorData.attributes.prof = Math.floor((Math.max(actorData.details.cr, 1) + 7) / 4);
            actorData.attributes.hp.formula = request.character['hp-formula'];
        } else {
            actorData.attributes.prof = parseInt(request.character.proficiency)
        }

        // Override spell slots so there's always one of each level. The activities built for these
        // items don't spend a slot either, so this is only here to keep a cast from being refused.
        for (let i = 1; i <= 9; i++) {
            if (!actorData.spells?.[`spell${i}`]) continue;
            actorData.spells[`spell${i}`].override = 1;
            actorData.spells[`spell${i}`].value = 1;
            actorData.spells[`spell${i}`].max = 1;
        }

        let items = [];
        const avatar = request.character.avatar;
        if (type === "character") {
            for (const [cls, level] of Object.entries(request.character.classes || {})) {
                const item = await this.getItemDataFromSRD("classes", "class", cls, { templateFallback: true, defaultImg: avatar });
                item.name = cls;
                item.system.levels = parseInt(level);
                items.push(item);
            }
            for (const feat of request.character['class-features'] || []) {
                const item = await this.getItemDataFromSRD("classFeatures", "feat", feat, { templateFallback: true, defaultImg: avatar });
                item.name = feat;
                items.push(item);
            }
            for (const trait of request.character['racial-features'] || []) {
                // Racial traits were looked up in the class feature index, so they never resolved
                const item = await this.getItemDataFromSRD("racialFeatures", "feat", trait, { templateFallback: true, defaultImg: avatar });
                item.name = trait;
                items.push(item);
            }
            for (const feat of request.character['feats'] || []) {
                const item = await this.getItemDataFromSRD("feats", "feat", feat, { templateFallback: true, defaultImg: avatar });
                item.name = feat;
                items.push(item);
            }
        } else {
            // NPC
            for (const action of request.character.actions || []) {
                let item = await this.getItemDataFromSRD("monsterFeatures", "feat", action);
                if (!item) {
                    item = await this.getItemDataFromSRD("items", "weapon", action, { templateFallback: true, defaultImg: avatar });
                }
                item.name = action;
                items.push(item);
            }
        }
        for (const item of initialItems) {
            // Make sure there are no default items that are named the same as the initially provided items
            items = items.filter(i => i.name !== item.name);
            items.push(item);
        }
    
        return {...baseAttributes, img: request.character.avatar, system: actorData, items}
    }

    /**
     * The compendiums to search for each kind of item, most current rules first. dnd5e ships the
     * 2024 content in its own packs and keeps the older SRD ones alongside, so a name is looked up
     * in the 2024 pack before falling back to the legacy one. There is no classfeatures24: the 2024
     * class features live in the classes24 pack.
     */
    static SRD_PACKS = {
        classes: ["dnd5e.classes24", "dnd5e.classes"],
        classFeatures: ["dnd5e.classes24", "dnd5e.classfeatures"],
        racialFeatures: ["dnd5e.origins24", "dnd5e.races"],
        feats: ["dnd5e.feats24", "dnd5e.classfeatures"],
        items: ["dnd5e.equipment24", "dnd5e.items"],
        monsterFeatures: ["dnd5e.monsterfeatures24", "dnd5e.monsterfeatures"]
    };

    /**
     * Get an Item from an SRD compendium and return a copy.
     * Optionally create a blank item from template
     *
     * @param {String} packGroup            Key into SRD_PACKS naming which compendiums to search
     * @param {String} type                 The type of Item
     * @param {String} name                 The name of the object
     *
     * @returns
     */
    static async getItemDataFromSRD(packGroup, type, name, {templateFallback=false, defaultImg=undefined}={}) {
        this._srdIndexes ??= {};
        const wanted = name.toLowerCase();
        let item = null;
        for (const compendiumName of this.SRD_PACKS[packGroup] || []) {
            const compendium = game.packs.get(compendiumName);
            if (!compendium) continue;
            this._srdIndexes[compendiumName] ??= await compendium.getIndex();
            const itemIdx = this._srdIndexes[compendiumName].find(c => c.name.toLowerCase() === wanted);
            if (!itemIdx) continue;
            const document = await compendium.getDocument(itemIdx._id);
            if (document) {
                item = fvtt_duplicate(document._source);
                delete item._id;
                break;
            }
        }
        if (!item && templateFallback) {
            item = {
                system: this._getDefaultTemplate('Item', type),
                effects: [],
                flags: {},
                folder: null,
                img: defaultImg,
                name: name,
                sort: 0,
                type: type
            };
        }
        return item;
    }
    static findToken(request) {
        let token = null;
        if (request.character.name) {
            const name = request.character.name.toLowerCase().trim();
            token = canvas.tokens.placeables.find((t) => ('isOwner' in t ? t.isOwner : t.owner) && t.name.toLowerCase().trim() == name);
        }
        return token || canvas.tokens.controlled[0];
    }
    /**
     * The speaker to put on a native roll's chat message, so it reads as coming from the character's
     * token. This used to be done by swapping token.document._actor, actorLink and actorId around
     * the roll, which are internals that can change in any release.
     */
    static _getSpeaker(actor, token) {
        return ChatMessage.getSpeaker(token ? { actor, token: token.document ?? token } : { actor });
    }

    /**
     * Roll mode names changed in Foundry 14: the rollMode setting with roll/gmroll/blindroll/selfroll
     * became messageMode with public/gm/blind/self. dnd5e hands whichever name it is given straight
     * to ChatMessage, so it has to match the generation rather than being hard-coded.
     */
    static _getRollMode(request) {
        const whispered = request.whisper !== 0;
        if ((game.release?.generation ?? 0) >= 14) return whispered ? "gm" : "public";
        return whispered ? "gmroll" : "roll";
    }

    static createItemData(request) {
        let type = "feat";
        switch (request.type) {
            default:
            case 'trait':
            case 'action':
            case 'feature':
                type = 'feat';
                break;
            case 'item':
                type = 'equipment';
                break;
            case 'spell-card':
            case 'spell-attack':
                type = 'spell';
                break;
            case 'attack':
                type = 'weapon';
                break;
        }
        const itemData = this._getDefaultTemplate('Item', type);
        if (type === 'feat' && request.source) {
            itemData.requirements = `${request.source}: ${request['source-type']}`;
        }
        if (type === 'equipment') {
            itemData.rarity = request['item-type'];
        }
        if (type === 'spell') {
            this._fillSpellData(request, itemData);
        }
        this._fillItemProperties(request, type, itemData);
        // Since dnd5e 3, everything a use actually rolls lives in an activity on the item
        itemData.activities = this._buildActivities(request, type);
        // source became a SourceField object rather than a plain string
        itemData.source = { custom: "Beyond20" };
        itemData.description.value = request.description.replace(/\n/g, "</br>");
        return {
            system: itemData,
            effects: [],
            flags: {},
            folder: null,
            img: request.preview || request.character.avatar,
            name: request.name,
            sort: 0,
            type: type
        };
    }

    static _fillSpellData(request, itemData) {
        const castingTime = request['casting-time'];
        const cost = parseInt(castingTime) || "";
        const activation = castingTime.slice(cost.toString().length).trim().toLowerCase();
        itemData.activation.cost = cost;
        itemData.activation.type = activation === "bonus action" ? "bonus" : activation;
        
        // The component booleans became entries in the item's properties set
        const properties = new Set();
        let components = request.components;
        while (components != "") {
            if (components[0] == "V") {
                properties.add("vocal");
                components = components.slice(1);
            } else if (components[0] == "S") {
                properties.add("somatic");
                components = components.slice(1);
            } else if (components[0] == "M") {
                properties.add("material");
                itemData.materials.value = components.slice(2, -1);
                components = "";
            }
            if (components.startsWith(", ")) {
                components = components.slice(2);
            }
        }
        if (request.concentration) properties.add("concentration");
        if (request.ritual) properties.add("ritual");
        itemData.properties = [...properties];

        // spellSchools entries are objects now, so matching against them as strings never hit. Match
        // the localised label, then the English fullKey for a game running in another language.
        const levelSchool = (request['level-school'] || "").toLowerCase();
        for (const [school, config] of Object.entries(CONFIG.DND5E.spellSchools)) {
            const label = (game.i18n.localize(config.label ?? config) || "").toLowerCase();
            const fullKey = (config.fullKey || "").toLowerCase();
            if ((label && levelSchool.includes(label)) || (fullKey && levelSchool.includes(fullKey))) {
                itemData.school = school;
                break;
            }
        }
        itemData.level = parseInt(request['cast-at'] || request['level-school']) || 0;
        itemData.duration.value = parseInt(request.duration) || "";
        itemData.duration.units = request.duration.slice(itemData.duration.value.toString().length).trim().toLowerCase();
        if (itemData.duration.units === "instantaneous") itemData.duration.units = "inst";
        const range = request.range;
        const target = request.aoe;
        switch (range) {
            case "Touch":
                itemData.range.units = "touch";
                break;
            case "Sight":
                itemData.range.units = "spec";
                break;
            case "Self":
                itemData.range.units = "self";
                break;
            case "Unlimited":
                itemData.range.units = "any";
                break;
            default:
                itemData.range.value = parseInt(range) || 0;
                itemData.range.units = range.includes("mile") ? "mi" : range.includes("ft") ? "ft" : "";
                break;
        }
        if (target) {
            itemData.target.value = parseInt(target) || 0;
            itemData.target.units = target.includes("mile") ? "mi" : target.includes("ft") ? "ft" : "";
            itemData.target.type = request['aoe-shape'].toLowerCase();
        }

        request.description = request.description.replace("At Higher Levels.", "<strong>At Higher Levels.</strong>");
    }

    /**
     * Weapon properties. weaponProperties became itemProperties, keyed by property id with a
     * localised label, and an item's properties are a set of ids rather than a map of booleans.
     * validProperties says which ids the item type actually accepts.
     */
    static _fillItemProperties(request, type, itemData) {
        if (!request.properties) return;
        const valid = CONFIG.DND5E.validProperties?.[type];
        if (!valid) return;
        const wanted = request.properties.map(p => p.toLowerCase().trim());
        const properties = new Set(itemData.properties || []);
        for (const id of valid) {
            const label = CONFIG.DND5E.itemProperties?.[id]?.label;
            if (!label) continue;
            if (wanted.includes(game.i18n.localize(label).toLowerCase())) properties.add(id);
        }
        itemData.properties = [...properties];
    }

    /**
     * D&D Beyond sends a damage formula per damage, already worked out. Passing each through as a
     * custom formula keeps it exactly as the sheet has it, rather than trying to split it back into
     * dice and bonus for dnd5e to reassemble.
     */
    static _buildDamageParts(request, {healing=false}={}) {
        const parts = [];
        for (let i = 0; i < (request.damages || []).length; i++) {
            const label = (request['damage-types']?.[i] || "").trim();
            let types = [];
            if (healing) {
                types = [label === "Temp HP" ? "temphp" : "healing"];
            } else if (CONFIG.DND5E.damageTypes[label.toLowerCase()]) {
                types = [label.toLowerCase()];
            }
            parts.push({
                custom: { enabled: true, formula: String(request.damages[i]) },
                types
            });
        }
        return parts;
    }

    static _isHealing(request) {
        const types = request['damage-types'] || [];
        return types.length > 0 && types.every(d => d.includes("Healing") || d === "Temp HP");
    }

    /**
     * Build the single activity that a generated item rolls. Exactly one is created on purpose: an
     * item with several activities makes dnd5e open a chooser before it rolls anything.
     */
    static _buildActivities(request, type) {
        const activity = {
            _id: fvtt_randomID(),
            name: request.name,
            sort: 0,
            // These items stand in for a D&D Beyond roll, so using one shouldn't spend a spell slot
            consumption: { spellSlot: false, targets: [] }
        };

        if (request['to-hit'] !== undefined) {
            activity.type = "attack";
            activity.attack = {
                // D&D Beyond has already added the ability modifier and proficiency, so the to-hit
                // goes in flat. flat makes dnd5e roll the bonus on its own and add nothing to it,
                // which replaces guessing which ability and how much magic bonus produced the total.
                flat: true,
                bonus: String(parseInt(request['to-hit']) || 0),
                type: {
                    value: request['attack-type'] === "Melee" ? "melee" : "ranged",
                    classification: type === "spell" ? "spell" : "weapon"
                }
            };
            activity.damage = { includeBase: false, parts: this._buildDamageParts(request) };
        } else if (request["save-dc"] !== undefined) {
            activity.type = "save";
            const ability = (request["save-ability"] || "").toLowerCase().slice(0, 3);
            activity.save = {
                // save.ability is a set of ability ids now, not a single one
                ability: ability ? [ability] : [],
                // An empty calculation means the DC is the flat number in the formula
                dc: { calculation: "", formula: String(request["save-dc"]) }
            };
            activity.damage = { onSave: "half", parts: this._buildDamageParts(request) };
        } else if (this._isHealing(request)) {
            activity.type = "heal";
            activity.healing = this._buildDamageParts(request, { healing: true })[0];
        } else if ((request.damages || []).length > 0) {
            activity.type = "damage";
            activity.damage = { parts: this._buildDamageParts(request) };
        } else {
            activity.type = "utility";
        }
        return { [activity._id]: activity };
    }
    /**
     * Roll configuration for dnd5e's actor roll methods, which take (config, dialog, message)
     * instead of the d20Roll helper this used to call.
     *
     * D&D Beyond has already settled the advantage state and which dice to roll, so that goes in as
     * flags rather than as a formula. halflingLucky and reliableTalent are read off the process
     * config, but elvenAccuracy is only ever read from an individual roll's options.
     */
    static getRollConfig(request) {
        const d20 = request.d20 || "1d20";
        const config = {
            reliableTalent: d20.includes("min10"), // Also applies to silver tongue
            halflingLucky: d20.includes("ro<=1"),
            rolls: [{ options: {} }]
        };
        switch (request.advantage) {
            default:
            case 0: // NORMAL
            case 1: // DOUBLE
            case 5: // THRICE
            case 2: // QUERY, answered by the roll dialog
                break;
            case 3: // ADVANTAGE
                config.advantage = true;
                break;
            case 6: // SUPER ADVANTAGE
                config.advantage = true;
                config.rolls[0].options.elvenAccuracy = true;
                break;
            case 4: // DISADVANTAGE
            case 7: // SUPER DISADVANTAGE
                config.disadvantage = true;
                break;
        }
        return config;
    }

    // Only a QUERY needs the roll dialog; every other case was decided on D&D Beyond
    static getRollDialogConfig(request) {
        return { configure: request.advantage === 2 };
    }

    static getRollMessageConfig(request, actor, token) {
        return {
            rollMode: this._getRollMode(request),
            data: { speaker: this._getSpeaker(actor, token) }
        };
    }

    /**
     * The proficiency dnd5e will add to a skill check for itself, taken from its own helper so that
     * half proficiency and expertise can't drift from what the roll actually builds.
     */
    static _skillProficiency(actor, ability, skill) {
        const helper = (game.dnd5e || globalThis.dnd5e)?.dataModels?.actor?.CommonTemplate;
        const prof = helper?.calculateSkillToolProficiency?.(actor, ability, { skill });
        if (prof) return prof.hasProficiency ? prof.flat : 0;
        const multiplier = actor.system.skills?.[skill]?.value || 0;
        return Math.floor(multiplier * (actor.system.attributes?.prof || 0));
    }

    static _advantageToD20(request) {
        switch (request.advantage) {
            default:
            case 0: // NORMAL
            case 1: // DOUBLE
            case 2: // QUERY
            case 5: // THRICE
                return "1d20";
            case 3: // ADVANTAGE
                return "2d20kh1";
            case 6: // SUPER ADVANTAGE
                return "3d20kh1";
            case 4: // DISADVANTAGE
                return "2d20kl1";
            case 7: // SUPER DISADVANTAGE
                return "3d20kl1";
        }
    }

    static async rollInitiative(request) {
        const characterName = request.character.name.toLowerCase().trim();
        const characterTokens = canvas.tokens.placeables.filter((t) => ('isOwner' in t ? t.isOwner : t.owner) && t.name.toLowerCase().trim() == characterName);
        const tokens = characterTokens.length > 0 ? characterTokens : canvas.tokens.controlled;
        if (tokens.length === 0) {
            ui.notifications.warn("Beyond20: No tokens found to roll initiative for");
            return;
        }
                            
        let combat = game.combat;
        if ( !combat  && !game.user.isGM && !canvas.scene ) {
            ui.notifications.warn(game.i18n.localize("COMBAT.NoneActive"));
            return;
        }

        if (!combat) {
            if (game.user.isGM) {
                // getDocumentClass is a bare global that Foundry 14 removed
                const Combat = CONFIG.Combat.documentClass;
                combat = await Combat.create({scene: canvas.scene.id, active: true});
            } else {
                return null;
            }
        }
        const mod = parseInt(request.initiative) || 0;
        let formula = request.d20 || "1d20";
        formula = formula.replace(/ro(=|<|<=|>|>=)([0-9]+)/g, "r$1$2");
        formula = formula.replace(/(^|\s)+([^\s]+)min([0-9]+)([^\s]*)/g, "$1{$2$4, $3}kh1");
        formula = formula.replace(/1d20/g, this._advantageToD20(request));
        formula += ` ${mod >= 0 ? '+' : ''} ${mod}`;

        const createData = tokens.reduce((arr, t) => {
        if ( t.inCombat ) return arr;
        arr.push({tokenId: t.id, hidden: t.hidden || request.whisper});
        return arr;
        }, []);
        if (createData.length) {
            await combat.createEmbeddedDocuments("Combatant", createData);
        }
        // Foundry 12 added getCombatantsByToken and Foundry 14 removed getCombatantByToken
        const combatants = tokens.map(t => combat.getCombatantsByToken
            ? combat.getCombatantsByToken(t.id)[0]
            : combat.getCombatantByToken(t.id));
        const mode = this._getRollMode(request);
        const messageOptions = (game.release?.generation ?? 0) >= 14 ? { messageMode: mode } : { rollMode: mode };
        await combat.rollInitiative(combatants.filter(c => !!c).map(c => c.id), { formula, messageOptions });

        //await token.actor.rollInitiative({createCombatants: true, rerollInitiative: true})
        return true;
    }

    static async rollSkill(request) {
        const actor = await this.getUpdatedActor(request);
        const actorData = actor.system;
        const token = this.findToken(request);
        
        const SKILLS = {
            "Acrobatics": "acr",
            "Animal Handling": "ani",
            "Arcana": "arc",
            "Athletics": "ath",
            "Deception": "dec",
            "History": "his",
            "Insight": "ins",
            "Intimidation": "itm",
            "Investigation": "inv",
            "Medicine": "med",
            "Nature": "nat",
            "Perception": "prc",
            "Performance": "prf",
            "Persuasion": "per",
            "Religion": "rel",
            "Sleight of Hand": "slt",
            "Stealth": "ste",
            "Survival": "sur"
        };
        const skill = SKILLS[request.skill];
        if (!skill) return;

        const PROFICIENCY = {
            "Half Proficiency": 0.5,
            "Proficiency": 1,
            "Expertise": 2
        };
        // Set the proficiency the sheet reports, so the card is labelled the way D&D Beyond has it
        if (actorData.skills?.[skill]) actorData.skills[skill].value = PROFICIENCY[request.proficiency] || 0;

        const ability = request.ability.toLowerCase();
        // dnd5e adds the ability modifier and the proficiency itself, so only the remainder is passed
        const calculated = (actorData.abilities[ability]?.mod || 0) + this._skillProficiency(actor, ability, skill);
        const bonus = parseInt(request.modifier) - calculated;

        const config = this.getRollConfig(request);
        config.skill = skill;
        config.ability = ability;
        if (bonus) config.bonus = String(bonus);

        await actor.rollSkill(config, this.getRollDialogConfig(request),
            this.getRollMessageConfig(request, actor, token));
        return true;
    }

    static async rollSavingThrow(request) {
        const actor = await this.getUpdatedActor(request);
        const actorData = actor.system;
        const token = this.findToken(request);
        
        const abl = request.ability.toLowerCase();
        const mod = parseInt(request.modifier);
        const abilityMod = actorData.abilities[abl]?.mod || 0;
        const prof = actorData.attributes?.prof || 0;
        // D&D Beyond only sends the final number, so proficiency is inferred from how big it is
        const proficient = mod >= abilityMod + prof;
        const calculated = abilityMod + (proficient ? prof : 0);
        const bonus = mod - calculated;

        if (actorData.abilities?.[abl]) actorData.abilities[abl].proficient = proficient ? 1 : 0;

        const config = this.getRollConfig(request);
        config.ability = abl;
        if (bonus) config.bonus = String(bonus);

        await actor.rollSavingThrow(config, this.getRollDialogConfig(request),
            this.getRollMessageConfig(request, actor, token));
        return true;
    }

    static async rollAbility(request) {
        const actor = await this.getUpdatedActor(request);
        const token = this.findToken(request);

        const abl = request.ability.toLowerCase();
        // An ability check is the bare modifier, so anything else D&D Beyond added is the remainder
        const bonus = parseInt(request.modifier) - (actor.system.abilities[abl]?.mod || 0);

        const config = this.getRollConfig(request);
        config.ability = abl;
        if (bonus) config.bonus = String(bonus);

        await actor.rollAbilityCheck(config, this.getRollDialogConfig(request),
            this.getRollMessageConfig(request, actor, token));
        return true;
    }

    static async rollItems(request) {
        const item = this.createItemData(request);
        const actor = await this.getUpdatedActor(request, [item]);
        const token = this.findToken(request);
        const actorItem = actor.items.find(i => i.type === item.type && i.name === item.name);
        if (!actorItem) return false;

        const message = {
            rollMode: this._getRollMode(request),
            data: { speaker: this._getSpeaker(actor, token) }
        };
        // use() takes (config, dialog, message) now, and displayCard takes the message config alone
        if (['attack', 'spell-attack'].includes(request.type)) {
            // Go straight to the item's own activity, so dnd5e never asks which one to use
            const activity = actorItem.system.activities?.contents?.[0];
            if (activity) await activity.use({}, { configure: false }, message);
            else await actorItem.use({}, { configure: false }, message);
        } else {
            await actorItem.displayCard(message);
        }
        return true;
    }

    /**
     * Native rolls are built on dnd5e's actor roll methods and its activities, which replaced the
     * d20Roll helper and the old actionType/damage.parts item data. Anything older than dnd5e 4
     * doesn't have them, and neither does a non-dnd5e system.
     */
    static nativeRollsSupported() {
        if (this._nativeRollsSupported === undefined) {
            const actorProto = CONFIG.Actor?.documentClass?.prototype;
            this._nativeRollsSupported = game.system?.id === "dnd5e" &&
                typeof actorProto?.rollSkill === "function" &&
                typeof actorProto?.rollSavingThrow === "function" &&
                typeof actorProto?.rollAbilityCheck === "function" &&
                !!CONFIG.DND5E?.activityTypes;
        }
        return this._nativeRollsSupported;
    }

    static handleBeyond20Request(action, request) {
        if (action !== "roll") return;
        if (!this.nativeRollsSupported()) return;
        let nativeRolls = false;
        try {
            nativeRolls = game.settings.get("beyond20", "nativeRolls");
        } catch (err) {
            nativeRolls = false;
        }
        if (!nativeRolls) return;
        // return false to interrupt the beyond20 
        switch (request.type) {
            case "skill":
                return !this.rollSkill(request);
            case "saving-throw":
                return !this.rollSavingThrow(request);
            case "ability":
                return !this.rollAbility(request);
            case "initiative":
                return !this.rollInitiative(request);
            case 'feature':
            case 'trait':
            case 'item':
            case 'attack':
            case 'action':
            case 'spell-attack':
            case 'spell-card':
                return !this.rollItems(request);
            default:
                break;
        }
    }
    /**
     * Add Chat Damage buttons to Beyond20 chat messages;
     */
    static handleChatMessage(message, html, data) {
        let showButtons = false;
        try {
            showButtons = game.settings.get("beyond20", "damageButtons");
        } catch (err) {
            showButtons = false;
        }
        if (!showButtons) return;
        // renderChatMessageHTML hands over an element, the older renderChatMessage a jQuery object
        const element = html instanceof HTMLElement ? html : html?.[0];
        if (!element) return;
        const damages = element.querySelectorAll(".beyond20-message .beyond20-roll-damage, .beyond20-message .beyond20-total-damage");
        for (const damage of damages) {
            this._addChatDamageButtons(damage);
        }
    }
    static _addChatDamageButtons(roll) {
        // The second selector falls back to the old chat message layout
        const valueSpan = roll.querySelector(".beyond20-roll-value") ||
            roll.querySelector(".beyond20-tooltip > span:first-child");
        if (!valueSpan) return;
        const damage = parseInt(valueSpan.textContent);
        if (isNaN(damage)) return;
        //const isTotal = roll.classList.contains("beyond20-total-damage");
        //const isCritical = roll.classList.contains("beyond20-critical-damage");
        //const isHealing = roll.classList.contains("beyond20-healing");
        const container = document.createElement("span");
        container.className = "beyond20-chat-damage-buttons-container";
        const arrow = document.createElement("i");
        arrow.className = "fa-solid fa-left-long";
        const buttonContainer = document.createElement("span");
        buttonContainer.className = "beyond20-chat-damage-buttons";
        container.append(arrow, buttonContainer);
        const buttons = [
            {
                multiplier: 1,
                icon: "user-minus",
                label: "Apply Damage",
                color: "Crimson",
                visible: true
            },
            {
                multiplier: 0.5,
                icon: "user-shield",
                label: "Apply Half Damage",
                color: "LightCoral",
                visible: true
            },
            {
                multiplier: 2,
                icon: "user-plus",
                label: "Apply Double Damage",
                color: "Red",
                visible: true
            },
            {
                multiplier: -1,
                icon: "kit-medical",
                label: "Apply Healing",
                color: "LightGreen",
                visible: true
            },
        ];
        for (const data of buttons) {
            if (!data.visible) continue;
            const button = document.createElement("button");
            button.type = "button";
            button.title = data.label;
            button.style.backgroundColor = data.color;
            const icon = document.createElement("i");
            icon.className = `fa-solid fa-${data.icon}`;
            button.append(icon);
            button.addEventListener('click', async () => {
                for (const token of canvas.tokens.controlled) {
                    await token.actor?.applyDamage(damage, { multiplier: data.multiplier });
                }
            });
            buttonContainer.append(button);
        }
        roll.append(container);
    }

    /**
     * Remind the player to activate the Beyond20 extension, which doesn't load
     * automatically on custom domains.
     */
    static showActivationReminder() {
        const content = "<p>Beyond20 does not load automatically for FVTT games on custom domains.</p>" +
            "<p>If you wish to use Beyond20, please activate it by clicking on the <img style='border: 0px; vertical-align: middle;' src='modules/beyond20/images/icons/icon20.png'/> icon in your browser's toolbar.</p>" +
            "<div class='form-group'>" +
            "<label for='dontaskagain'>Don't remind me again.</label>" +
            "<input name='dontaskagain' type='checkbox' value='false' data-dtype='Boolean'></input>" +
            "</div>";
        const dismiss = (dontAskAgain) => game.settings.set("beyond20", "notifyAtLoad", !dontAskAgain);
        let closed = false;
        let dialog;
        const DialogV2 = foundry.applications?.api?.DialogV2;
        if (DialogV2) {
            dialog = new DialogV2({
                window: { title: "Beyond20" },
                position: { width: 600 },
                content,
                buttons: [{
                    action: "dismiss",
                    label: "Dismiss",
                    icon: "fa-solid fa-xmark",
                    default: true,
                    callback: (event, button) => dismiss(button.form.elements.dontaskagain.checked)
                }]
            });
            dialog.addEventListener?.("close", () => closed = true, { once: true });
            dialog.render({ force: true });
        } else {
            dialog = new Dialog({
                title: "Beyond20",
                content,
                buttons: {
                    dismiss: {
                        icon: '<i class="fas fa-times"></i>',
                        label: "Dismiss",
                        callback: html => dismiss(html.find("input[name=dontaskagain]")[0].checked)
                    }
                },
                default: "dismiss",
                close: () => closed = true
            }, { width: 600 });
            dialog.render(true);
        }
        // Close the reminder once the extension gets activated in this tab
        const closeWhenActivated = () => {
            if (closed) return;
            if (game.beyond20) return dialog.close();
            setTimeout(closeWhenActivated, 500);
        };
        setTimeout(closeWhenActivated, 500);
    }
}

// The settings menu only needs a render() entry point, so extend ApplicationV2 where it exists
// instead of the deprecated FormApplication
const Beyond20MenuApplication = foundry.applications?.api?.ApplicationV2 ?? FormApplication;
class Beyond20CreateNativeActorsApplication extends Beyond20MenuApplication {
    async render() {
        if (!game.user.isGM) {
            return ui.notifications.error("Only the GM can create actors for Beyond20.");
        }
        let folder = game.folders.find(f => f.name === "Beyond20" && f.type === "Actor");
        if (!folder) {
            folder = await Folder.create({name: "Beyond20", type: "Actor"});
        }
        for (const user of game.users.contents) {
            const actor = game.actors.find(a => a.getFlag("beyond20", "user") === user.id);
            if (!actor) {
                const actorData = {
                    name: user.name,
                    type: "character",
                    img: "modules/beyond20/images/icons/icon256.png",
                    folder: folder.id,
                    flags: {
                        beyond20: {
                            user: user.id
                        }
                    }
                }
                // In v10, permission field was changed into ownership
                if (fvtt_isNewer(game.version || game.data.version, "10")) {
                    actorData["ownership"] = {
                        [user.id]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER
                    }
                } else {
                    actorData["permission"] = {
                        [user.id]: CONST.DOCUMENT_PERMISSION_LEVELS.OWNER
                    }
                }
                await Actor.create(actorData);
                ui.notifications.info(`Created Beyond20 Actor for user ${user.name}`);
            }
        }
        ui.notifications.info("Beyond20 Actors creation completed.");
    }
}

Hooks.on('beyond20Request', (action, request) => Beyond20.handleBeyond20Request(action, request))

Hooks.on('init', function () {
    const foundryVersion = game.version || game.data.version;
    // Choose the chat hook once the game is initialized: reading the version while this
    // script loads can throw before any of the hooks below are registered.
    const chatHook = fvtt_isNewer(foundryVersion, "13") ? "renderChatMessageHTML" : "renderChatMessage";
    Hooks.on(chatHook, (message, html, data) => Beyond20.handleChatMessage(message, html, data));

    game.settings.register("beyond20", "notifyAtLoad", {
        name: "Notify player to activate Beyond20",
        hint: "Beyond20 extension doesn't load automatically for Foundry unless permission is granted. The module can show a notification to remind the player to activate it for the current tab.",
        scope: "client",
        config: true,
        default: true,
        type: Boolean
    });
    /**
     * Inspired by chatdamagebuttons-beyond20 module by Victor Ling: https://gitlab.com/Ionshard/foundry-vtt-chatdamagebuttons-beyond20/
     */
    game.settings.register("beyond20", "damageButtons", {
        name: "Add chat damage buttons",
        hint: "Adds chat damage buttons to rolls to more easily apply damage or healing to tokens",
        scope: "client",
        config: true,
        default: true,
        type: Boolean
    });
    // Only offer native rolls when this Foundry and dnd5e combination can run them
    const nativeRollsSupported = Beyond20.nativeRollsSupported();
    game.settings.register("beyond20", "nativeRolls", {
        name: "Use Foundry native rolls (EXPERIMENTAL)",
        hint: "If enabled, will use Foundry native rolls instead of the Beyond20 roll renderer. Cannot work when D&D Beyond Digital Dice are enabled. All Beyond20 features may not be supported. Rebuilt for dnd5e 4 and later: please report anything that rolls the wrong number.",
        scope: "client",
        config: nativeRollsSupported,
        default: false,
        type: Boolean,
        onChange: async (v) => {
            if (!v) return;
            if (!fvtt_isNewer(foundryVersion, "10")) {
                ui.notifications.warn(`Cannot enable Beyond20 native rolls on Foundry VTT v${foundryVersion}. Please upgrade to version 10 or newer.`);
                return game.settings.set("beyond20", "nativeRolls", false);
            }
            if (Actor.canUserCreate(game.user)) return true;
            if (!Beyond20.getMyActor()) {
                ui.notifications.warn(`Cannot enable Beyond20 native rolls because native actor doesn't exist. Please ask your GM to create the actors from the Beyond20 module settings.`, {permanent: true});
                return game.settings.set("beyond20", "nativeRolls", false);
            }
        }
    });
    if (nativeRollsSupported) {
        game.settings.registerMenu("beyond20", "createNativeActors", {
            name: "Create native rolls Actors",
            label: "Create Actors",      // The text label used in the button
            hint: "Creates a Beyond20 native rolls actor for each user (if one doesn't exist), allowing them to use the native rolls feature.",
            icon: "fa-solid fa-users",
            type: Beyond20CreateNativeActorsApplication,   // An Application subclass which should be created
            restricted: true
        });
    }
});

Hooks.on('ready', function () {
    const foundryVersion = game.version || game.data.version;
    let nativeRolls = game.settings.get("beyond20", "nativeRolls");
    if (nativeRolls && !Beyond20.nativeRollsSupported()) {
        ui.notifications.warn(`Disabled Beyond20 native rolls as they are not supported on Foundry VTT v${foundryVersion} with this version of the D&D 5e system.`, {permanent: true});
        game.settings.set("beyond20", "nativeRolls", false);
        nativeRolls = false;
    }
    if (nativeRolls && !Actor.canUserCreate(game.user)) {
        if (!Beyond20.getMyActor()) {
            ui.notifications.warn(`Cannot enable Beyond20 native rolls because native actor doesn't exist. Please ask your GM to create the actors from the Beyond20 module settings.`, {permanent: true});
            game.settings.set("beyond20", "nativeRolls", false);
            nativeRolls = false;
        }
    }
    // Disable native rolls if Foundry is pre v10
    if (nativeRolls && !fvtt_isNewer(foundryVersion, "10")) {
        ui.notifications.warn(`Disabled Beyond20 native rolls feature as it is incompatible with Foundry VTT v${foundryVersion}. Please upgrade to version 10 or newer.`, {permanent: true});
        game.settings.set("beyond20", "nativeRolls", false);
    }
    if (game.settings.get("beyond20", "notifyAtLoad") && !game.beyond20) {
        Beyond20.showActivationReminder();
    }
})
