// Exercises the ported plain-DOM damage buttons straight out of the module source,
// so the test can never drift from the shipped code.
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const SRC = path.join(__dirname, "..", "FVTT-module", "beyond20", "beyond20.js");

const source = fs.readFileSync(SRC, "utf8").replace(/\r\n/g, "\n");

// Lift just the two ported methods out of the class body
const start = source.indexOf("    static handleChatMessage(message, html, data) {");
const end = source.indexOf("    /**\n     * Remind the player");
if (start < 0 || end < 0) throw new Error("could not locate handleChatMessage/_addChatDamageButtons in the module source");
const methods = source.slice(start, end);

const dom = new JSDOM("<!doctype html><body></body>", { pretendToBeVisual: true });
const { window } = dom;
global.window = window;
global.document = window.document;
global.HTMLElement = window.HTMLElement;

const applied = [];
let showButtons = true;
const game = { settings: { get: (m, k) => (k === "damageButtons" ? showButtons : false) } };
const canvas = { tokens: { controlled: [{ actor: { applyDamage: (d, o) => { applied.push([d, o.multiplier]); return Promise.resolve(); } } }] } };

const Beyond20 = new Function("game", "canvas", "document", "HTMLElement",
    `class Beyond20 {\n${methods}\n}\nreturn Beyond20;`)(game, canvas, window.document, window.HTMLElement);

const results = [];
const check = (name, ok, extra = "") => results.push({ name, ok: !!ok, extra });

function makeMessage(inner) {
    const li = window.document.createElement("li");
    li.className = "chat-message";
    li.innerHTML = `<div class="beyond20-message">${inner}</div>`;
    return li;
}
const container = (el) => el.querySelector(".beyond20-chat-damage-buttons-container");

(async () => {
    // 1. current layout, element passed directly (V13+ renderChatMessageHTML)
    let el = makeMessage(`<span class="beyond20-roll-damage"><span class="beyond20-roll-value">12</span></span>`);
    Beyond20.handleChatMessage({}, el, {});
    let c = container(el);
    check("element input: container added", c);
    check("element input: 4 buttons", c && c.querySelectorAll("button").length === 4, c && `got ${c.querySelectorAll("button").length}`);
    check("element input: arrow icon", el.querySelector(".beyond20-chat-damage-buttons-container > i.fa-left-long"));
    check("element input: every button type=button", c && [...c.querySelectorAll("button")].every(b => b.type === "button"));
    check("element input: FA6 icon names", c &&
        [...c.querySelectorAll("button i")].map(i => i.className).join(",") ===
        "fa-solid fa-user-minus,fa-solid fa-user-shield,fa-solid fa-user-plus,fa-solid fa-kit-medical");
    check("element input: background colour set", c && c.querySelector("button").style.backgroundColor === "crimson");
    check("element input: title set", c && c.querySelector("button").title === "Apply Damage");
    check("element input: buttons nested in .beyond20-chat-damage-buttons",
        c && c.querySelector(".beyond20-chat-damage-buttons > button"));

    // 2. jQuery-like input (legacy renderChatMessage hands over a jQuery object)
    el = makeMessage(`<span class="beyond20-total-damage"><span class="beyond20-roll-value">7</span></span>`);
    Beyond20.handleChatMessage({}, { 0: el, length: 1 }, {});
    check("jQuery-like input: container added", container(el));

    // 3. old chat message layout, no .beyond20-roll-value
    el = makeMessage(`<span class="beyond20-roll-damage"><span class="beyond20-tooltip"><span>9</span><span>ignored</span></span></span>`);
    Beyond20.handleChatMessage({}, el, {});
    check("old layout fallback: container added", container(el));

    // 4. multiple damage rolls in one message each get their own buttons
    el = makeMessage(`<span class="beyond20-roll-damage"><span class="beyond20-roll-value">3</span></span>` +
                     `<span class="beyond20-total-damage"><span class="beyond20-roll-value">8</span></span>`);
    Beyond20.handleChatMessage({}, el, {});
    check("two rolls: two containers", el.querySelectorAll(".beyond20-chat-damage-buttons-container").length === 2,
        `got ${el.querySelectorAll(".beyond20-chat-damage-buttons-container").length}`);

    // 5. clicking applies the right multiplier of the right damage
    el = makeMessage(`<span class="beyond20-roll-damage"><span class="beyond20-roll-value">10</span></span>`);
    Beyond20.handleChatMessage({}, el, {});
    const btns = el.querySelectorAll(".beyond20-chat-damage-buttons button");
    for (const b of btns) b.click();
    await new Promise(r => setTimeout(r, 10));
    check("click applies 1x / 0.5x / 2x / -1x of 10",
        JSON.stringify(applied) === JSON.stringify([[10, 1], [10, 0.5], [10, 2], [10, -1]]), JSON.stringify(applied));

    // 6. non-numeric roll value is skipped
    el = makeMessage(`<span class="beyond20-roll-damage"><span class="beyond20-roll-value">--</span></span>`);
    Beyond20.handleChatMessage({}, el, {});
    check("non-numeric roll skipped", !container(el));

    // 7. setting off adds nothing
    showButtons = false;
    el = makeMessage(`<span class="beyond20-roll-damage"><span class="beyond20-roll-value">5</span></span>`);
    Beyond20.handleChatMessage({}, el, {});
    check("setting disabled: nothing added", !container(el));
    showButtons = true;

    // 8. a card that is not a Beyond20 message is left alone (B4's scoping concern)
    const other = window.document.createElement("li");
    other.innerHTML = `<div class="dice-roll"><span class="beyond20-roll-damage"><span class="beyond20-roll-value">4</span></span></div>`;
    Beyond20.handleChatMessage({}, other, {});
    check("non-beyond20 card untouched", !container(other));

    // 9. bad input does not throw
    let threw = false;
    try { Beyond20.handleChatMessage({}, null, {}); Beyond20.handleChatMessage({}, undefined, {}); } catch (e) { threw = true; }
    check("null/undefined html does not throw", !threw);

    // 10. the whole thing ran with no jQuery anywhere
    check("no jQuery global was needed", typeof global.$ === "undefined" && typeof global.jQuery === "undefined");

    for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.extra ? `  [${r.extra}]` : ""}`);
    const pass = results.filter(r => r.ok).length;
    console.log(`\n${pass}/${results.length} passed`);
    process.exit(pass === results.length ? 0 : 1);
})();
