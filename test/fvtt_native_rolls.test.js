// Loads FVTT-module/beyond20/beyond20.js against stand-in Foundry and dnd5e globals and checks the
// rewritten native rolls: the activity data it builds, the roll configs it passes to dnd5e's actor
// methods, and the version-dependent roll mode names.
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const SRC = path.join(__dirname, "..", "FVTT-module", "beyond20", "beyond20.js");
const source = fs.readFileSync(SRC, "utf8").replace(/\r\n/g, "\n");

const dom = new JSDOM("<!doctype html><body></body>");

const results = [];
const check = (name, ok, extra = "") => results.push({ name, ok: !!ok, extra });
const eq = (name, actual, expected) =>
    check(name, JSON.stringify(actual) === JSON.stringify(expected),
        JSON.stringify(actual) === JSON.stringify(expected) ? "" : `got ${JSON.stringify(actual)} want ${JSON.stringify(expected)}`);

// ---------------------------------------------------------------- stand-in globals
function makeEnv(generation) {
    const rolled = [];
    const hooks = {};
    const CONFIG = {
        Actor: { documentClass: { prototype: { rollSkill() {}, rollSavingThrow() {}, rollAbilityCheck() {} } } },
        Combat: { documentClass: class {} },
        DND5E: {
            activityTypes: { attack: {}, save: {}, damage: {}, heal: {}, utility: {} },
            damageTypes: { fire: {}, cold: {}, piercing: {}, slashing: {}, bludgeoning: {}, radiant: {} },
            healingTypes: { healing: {}, temphp: {} },
            abilities: { str: { label: "Strength" }, dex: { label: "Dexterity" }, con: { label: "Constitution" },
                int: { label: "Intelligence" }, wis: { label: "Wisdom" }, cha: { label: "Charisma" } },
            skills: { ste: { label: "Stealth", ability: "dex" }, arc: { label: "Arcana", ability: "int" } },
            spellSchools: {
                abj: { label: "DND5E.SchoolAbj", fullKey: "abjuration" },
                evo: { label: "DND5E.SchoolEvo", fullKey: "evocation" }
            },
            itemProperties: { fin: { label: "DND5E.Finesse" }, ver: { label: "DND5E.Versatile" }, mgc: { label: "DND5E.Magical" } },
            validProperties: {
                weapon: new Set(["fin", "ver", "mgc"]),
                spell: new Set(["vocal", "somatic", "material", "concentration", "ritual"])
            }
        },
        sounds: { dice: "dice.wav" },
        Dice: {}
    };
    const i18n = {
        localize: k => ({ "DND5E.SchoolAbj": "Abjuration", "DND5E.SchoolEvo": "Evocation",
            "DND5E.Finesse": "Finesse", "DND5E.Versatile": "Versatile", "DND5E.Magical": "Magical" }[k] ?? k),
        format: (k, d) => `${k}:${JSON.stringify(d)}`
    };
    // Minimal data-model stand-in: the document returns the default system object for its type
    const DEFAULTS = {
        character: { abilities: {}, attributes: { ac: {}, hp: {}, prof: 0 }, skills: { ste: { value: 0 }, arc: { value: 0 } },
            spells: Object.fromEntries([1,2,3,4,5,6,7,8,9].map(i => [`spell${i}`, {}])), bonuses: { abilities: {} }, details: {} },
        npc: { abilities: {}, attributes: { ac: {}, hp: {}, prof: 0 }, skills: {}, spells: {}, bonuses: { abilities: {} }, details: {} },
        weapon: { description: {}, properties: [], activities: {} },
        spell: { description: {}, properties: [], activities: {}, materials: {}, activation: {}, duration: {}, range: {}, target: {} },
        feat: { description: {}, properties: [], activities: {} },
        equipment: { description: {}, properties: [], activities: {} }
    };
    class DocStub {
        constructor(data) { this._type = data.type; }
        toObject() { return { system: JSON.parse(JSON.stringify(DEFAULTS[this._type] ?? {})) }; }
    }
    const env = {
        foundry: {
            utils: {
                isNewerVersion: (a, b) => parseFloat(a) > parseFloat(b),
                duplicate: o => JSON.parse(JSON.stringify(o)),
                mergeObject: Object.assign,
                randomID: () => "abcdefgh12345678"
            },
            dice: { terms: { Die: class {}, PoolTerm: class {} } },
            applications: { api: { DialogV2: class { render() {} addEventListener() {} close() {} }, ApplicationV2: class {} } }
        },
        CONFIG,
        Hooks: { on: (n, f) => { (hooks[n] ??= []).push(f); }, once: () => {} },
        game: {
            system: { id: "dnd5e" },
            release: { generation },
            version: `${generation}.367`,
            i18n,
            user: { id: "u1", isGM: true },
            users: { contents: [] },
            actors: [],
            packs: { get: () => null },
            settings: { register: () => {}, registerMenu: () => {}, get: () => false, set: () => {} },
            dnd5e: { dataModels: { actor: { CommonTemplate: {
                // Stand-in for dnd5e's own proficiency helper: half proficiency rounds down
                calculateSkillToolProficiency: (actor, ability, { skill }) => {
                    const mult = actor.system.skills?.[skill]?.value || 0;
                    const base = actor.system.attributes?.prof || 0;
                    return { multiplier: mult, hasProficiency: base > 0 && mult > 0, flat: Math.floor(mult * base) };
                }
            } } } }
        },
        ChatMessage: { getSpeaker: a => ({ alias: a.token ? "token" : "actor" }) },
        Actor: DocStub, Item: DocStub,
        canvas: { tokens: { placeables: [], controlled: [] } },
        ui: { notifications: { warn: () => {}, info: () => {}, error: () => {} } },
        CONST: { DOCUMENT_OWNERSHIP_LEVELS: { OWNER: 3 }, DOCUMENT_PERMISSION_LEVELS: { OWNER: 3 } },
        document: dom.window.document,
        HTMLElement: dom.window.HTMLElement,
        rolled
    };
    const names = Object.keys(env);
    const Beyond20 = new Function(...names, `${source}\n; return Beyond20;`)(...names.map(n => env[n]));
    return { Beyond20, env, rolled };
}

// ---------------------------------------------------------------- fixtures
const character = {
    name: "Tess", type: "Character", proficiency: "3",
    abilities: [["Strength", "STR", "10", "0"], ["Dexterity", "DEX", "18", "4"], ["Intelligence", "INT", "14", "2"]],
    ac: "15", hp: "20", "max-hp": "30", "temp-hp": "0", avatar: "a.png"
};
const base = { character, description: "desc", whisper: 0, advantage: 0, name: "Thing" };

const { Beyond20 } = makeEnv(14);

// ---------------------------------------------------------------- E4: activities
let item = Beyond20.createItemData({ ...base, type: "attack", name: "Rapier",
    "to-hit": "+8", "attack-type": "Melee", damages: ["1d8+4", "2d6"], "damage-types": ["Slashing", "Fire"],
    properties: ["Finesse", "Versatile"] });
let activities = Object.values(item.system.activities);
check("attack: one activity only (no chooser)", activities.length === 1, `got ${activities.length}`);
let act = activities[0];
eq("attack: type", act.type, "attack");
check("attack: flat to-hit, no ability guessing", act.attack.flat === true && act.attack.bonus === "8",
    JSON.stringify(act.attack));
eq("attack: melee weapon classification", act.attack.type, { value: "melee", classification: "weapon" });
eq("attack: damage parts pass the formula through", act.damage.parts,
    [{ custom: { enabled: true, formula: "1d8+4" }, types: ["slashing"] },
     { custom: { enabled: true, formula: "2d6" }, types: ["fire"] }]);
check("attack: base damage excluded", act.damage.includeBase === false);
check("attack: no spell slot consumed", act.consumption.spellSlot === false);
eq("attack: item properties resolved to ids", item.system.properties.sort(), ["fin", "ver"]);
eq("attack: source is a SourceField object", item.system.source, { custom: "Beyond20" });
check("attack: item type", item.type === "weapon");

item = Beyond20.createItemData({ ...base, type: "spell-attack", name: "Fire Bolt",
    "to-hit": "+7", "attack-type": "Ranged", damages: ["2d10"], "damage-types": ["Fire"],
    "casting-time": "1 action", components: "V, S", "level-school": "Cantrip Evocation",
    duration: "Instantaneous", range: "120 ft", concentration: false, ritual: false });
act = Object.values(item.system.activities)[0];
eq("spell attack: ranged spell classification", act.attack.type, { value: "ranged", classification: "spell" });
eq("spell: school matched from the localised label", item.system.school, "evo");
eq("spell: components became properties", item.system.properties.sort(), ["somatic", "vocal"]);

item = Beyond20.createItemData({ ...base, type: "spell-card", name: "Fireball",
    "save-dc": "15", "save-ability": "Dexterity", damages: ["8d6"], "damage-types": ["Fire"],
    "casting-time": "1 action", components: "V, S, M (a tiny ball of bat guano)", "level-school": "3rd level Evocation",
    duration: "Instantaneous", range: "150 ft", concentration: true, ritual: false });
act = Object.values(item.system.activities)[0];
eq("save: type", act.type, "save");
eq("save: ability is a list", act.save.ability, ["dex"]);
eq("save: flat DC", act.save.dc, { calculation: "", formula: "15" });
eq("save: half damage on a save", act.damage.onSave, "half");
check("save: concentration and material in properties",
    item.system.properties.includes("concentration") && item.system.properties.includes("material"),
    JSON.stringify(item.system.properties));

item = Beyond20.createItemData({ ...base, type: "spell-card", name: "Cure Wounds",
    damages: ["1d8+3"], "damage-types": ["Healing"], "casting-time": "1 action", components: "V, S",
    "level-school": "1st level Abjuration", duration: "Instantaneous", range: "Touch",
    concentration: false, ritual: false });
act = Object.values(item.system.activities)[0];
eq("heal: type", act.type, "heal");
eq("heal: healing part", act.healing, { custom: { enabled: true, formula: "1d8+3" }, types: ["healing"] });

item = Beyond20.createItemData({ ...base, type: "spell-card", name: "False Life",
    damages: ["1d4+4"], "damage-types": ["Temp HP"], "casting-time": "1 action", components: "V, S, M (a small amount of alcohol)",
    "level-school": "1st level Abjuration", duration: "1 hour", range: "Self", concentration: false, ritual: false });
act = Object.values(item.system.activities)[0];
eq("temp hp: healing type is temphp", act.healing.types, ["temphp"]);

item = Beyond20.createItemData({ ...base, type: "feature", name: "Second Wind", source: "Fighter", "source-type": "Class" });
act = Object.values(item.system.activities)[0];
eq("no damage and no attack: utility activity", act.type, "utility");

item = Beyond20.createItemData({ ...base, type: "item", name: "Caltrops", "item-type": "common",
    damages: ["1d4"], "damage-types": ["Piercing"] });
act = Object.values(item.system.activities)[0];
eq("damage only: damage activity", act.type, "damage");

// ---------------------------------------------------------------- E3: roll configs
let cfg = Beyond20.getRollConfig({ ...base, advantage: 0, d20: "1d20" });
check("normal: no advantage flags", !cfg.advantage && !cfg.disadvantage);
cfg = Beyond20.getRollConfig({ ...base, advantage: 3 });
check("advantage flag", cfg.advantage === true && !cfg.disadvantage);
cfg = Beyond20.getRollConfig({ ...base, advantage: 4 });
check("disadvantage flag", cfg.disadvantage === true && !cfg.advantage);
cfg = Beyond20.getRollConfig({ ...base, advantage: 6 });
check("super advantage sets elvenAccuracy on the roll, not the process",
    cfg.advantage === true && cfg.rolls[0].options.elvenAccuracy === true && cfg.elvenAccuracy === undefined,
    JSON.stringify(cfg));
cfg = Beyond20.getRollConfig({ ...base, d20: "1d20min10" });
check("reliableTalent from the d20 formula", cfg.reliableTalent === true);
cfg = Beyond20.getRollConfig({ ...base, d20: "1d20ro<=1" });
check("halflingLucky from the d20 formula", cfg.halflingLucky === true);
eq("query opens the dialog", Beyond20.getRollDialogConfig({ ...base, advantage: 2 }), { configure: true });
eq("anything else skips the dialog", Beyond20.getRollDialogConfig({ ...base, advantage: 3 }), { configure: false });

// ---------------------------------------------------------------- roll mode names per generation
eq("v14 public", Beyond20._getRollMode({ whisper: 0 }), "public");
eq("v14 gm", Beyond20._getRollMode({ whisper: 1 }), "gm");
const { Beyond20: B13 } = makeEnv(13);
eq("v13 roll", B13._getRollMode({ whisper: 0 }), "roll");
eq("v13 gmroll", B13._getRollMode({ whisper: 1 }), "gmroll");

// ---------------------------------------------------------------- E7 pack order
eq("racial features search origins24 then races", Beyond20.SRD_PACKS.racialFeatures, ["dnd5e.origins24", "dnd5e.races"]);
eq("classes search classes24 first", Beyond20.SRD_PACKS.classes, ["dnd5e.classes24", "dnd5e.classes"]);
eq("feats search feats24 first", Beyond20.SRD_PACKS.feats, ["dnd5e.feats24", "dnd5e.classfeatures"]);
check("class features fall back to classfeatures (there is no classfeatures24)",
    Beyond20.SRD_PACKS.classFeatures.includes("dnd5e.classfeatures") &&
    !JSON.stringify(Beyond20.SRD_PACKS).includes("classfeatures24"));

// ---------------------------------------------------------------- support gate
check("gate passes when the new dnd5e APIs are present", Beyond20.nativeRollsSupported() === true);
const { Beyond20: BOld } = makeEnv(13);
BOld._nativeRollsSupported = undefined;
delete BOld.constructor; // no-op, keeps linters quiet
check("gate fails without activityTypes", (() => {
    const { Beyond20: B, env } = makeEnv(14);
    delete env.CONFIG.DND5E.activityTypes;
    B._nativeRollsSupported = undefined;
    return B.nativeRollsSupported() === false;
})());
check("gate fails on a non-dnd5e system", (() => {
    const { Beyond20: B, env } = makeEnv(14);
    env.game.system.id = "pf2e";
    B._nativeRollsSupported = undefined;
    return B.nativeRollsSupported() === false;
})());

// ---------------------------------------------------------------- E3/E6: what actually gets called
function makeActor(calls) {
    const record = name => (config, dialog, message) => { calls.push({ name, config, dialog, message }); };
    return {
        id: "a1",
        system: {
            abilities: { dex: { mod: 4 }, int: { mod: 2 }, str: { mod: 0 } },
            attributes: { prof: 3 },
            skills: { ste: { value: 0 }, arc: { value: 0 } },
            bonuses: { abilities: {} }
        },
        rollSkill: record("rollSkill"),
        rollSavingThrow: record("rollSavingThrow"),
        rollAbilityCheck: record("rollAbilityCheck")
    };
}
async function rollWith(method, request, { token = null } = {}) {
    const calls = [];
    const { Beyond20: B } = makeEnv(14);
    const actor = makeActor(calls);
    B.getUpdatedActor = async () => actor;
    B.findToken = () => token;
    if (typeof B[method] !== "function") throw new Error(`Beyond20.${method} is not a function`);
    await B[method](request);
    return calls[0];
}

(async () => {
    // Stealth, expertise: dex 4 + 2x prof 3 = 10, sheet says 12, so 2 is left over
    let call = await rollWith("rollSkill", { ...base, type: "skill", skill: "Stealth", ability: "DEX",
        proficiency: "Expertise", modifier: "12" });
    eq("rollSkill is the method called", call.name, "rollSkill");
    eq("rollSkill: skill and ability", [call.config.skill, call.config.ability], ["ste", "dex"]);
    eq("rollSkill: leftover passed as a flat bonus", call.config.bonus, "2");
    eq("rollSkill: dialog skipped", call.dialog, { configure: false });
    eq("rollSkill: message carries mode and speaker", [call.message.rollMode, call.message.data.speaker.alias],
        ["public", "actor"]);

    // Half proficiency rounds down: dex 4 + floor(0.5*3)=1 -> 5, sheet says 5, nothing left over
    call = await rollWith("rollSkill", { ...base, type: "skill", skill: "Stealth", ability: "DEX",
        proficiency: "Half Proficiency", modifier: "5" });
    check("rollSkill: exact match adds no bonus", call.config.bonus === undefined, JSON.stringify(call.config.bonus));

    // Not proficient: arcana int 2, sheet says 2
    call = await rollWith("rollSkill", { ...base, type: "skill", skill: "Arcana", ability: "INT",
        proficiency: "Not Proficient", modifier: "2" });
    check("rollSkill: unproficient needs no bonus", call.config.bonus === undefined);

    // Save: dex 4 + prof 3 = 7 means proficient, sheet says 9, so 2 left over
    call = await rollWith("rollSavingThrow", { ...base, type: "saving-throw", ability: "DEX", modifier: "9" });
    eq("rollSavingThrow is the method called", call.name, "rollSavingThrow");
    eq("rollSavingThrow: ability", call.config.ability, "dex");
    eq("rollSavingThrow: leftover bonus", call.config.bonus, "2");

    // Save without proficiency: dex 4, sheet says 4
    call = await rollWith("rollSavingThrow", { ...base, type: "saving-throw", ability: "DEX", modifier: "4" });
    check("rollSavingThrow: unproficient save needs no bonus", call.config.bonus === undefined);

    // Ability check is the bare modifier: dex 4, sheet says 6
    call = await rollWith("rollAbility", { ...base, type: "ability", ability: "DEX", modifier: "6" });
    eq("rollAbilityCheck is the method called", call.name, "rollAbilityCheck");
    eq("rollAbilityCheck: leftover bonus", call.config.bonus, "2");

    // A token makes the speaker the token's, without touching token internals
    call = await rollWith("rollAbility", { ...base, type: "ability", ability: "DEX", modifier: "4" },
        { token: { document: {} } });
    eq("speaker comes from the token when there is one", call.message.data.speaker.alias, "token");

    // Whispered rolls use the v14 mode name
    call = await rollWith("rollSkill", { ...base, whisper: 1, type: "skill", skill: "Stealth", ability: "DEX",
        proficiency: "Proficiency", modifier: "7" });
    eq("whispered roll uses the v14 gm mode", call.message.rollMode, "gm");

    report();
})();

// ---------------------------------------------------------------- report
function report() {
    for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.extra ? `  [${r.extra}]` : ""}`);
    const pass = results.filter(r => r.ok).length;
    console.log(`\n${pass}/${results.length} passed`);
    process.exit(pass === results.length ? 0 : 1);
}
