var advancedOptions = false;

function createOptionList() {
    $("main .beyond20-options").remove();
    const options = [];
    for (let option in options_list) {
        const child = createHTMLOption(option, false, options_list, {advanced: advancedOptions});
        if (child)
            options.push(child);
    }
    $("main").prepend(E.ul({ class: "list-group beyond20-options" }, ...options));
    // Say so up front when this is the test fork rather than the store release. This function runs
    // again whenever the advanced options are toggled, so the banner is only added once.
    if (isTestBuild() && $(".beyond20-test-build-banner").length === 0) {
        $("main").prepend(
            E.div({ class: "beyond20-test-build-banner" },
                E.strong({}, "Test build"),
                E.span({}, ` — ${getBuildVersion()}. Foundry VTT 14 fixes. Not the store release.`)
            )
        );
    }
}

function save_settings() {
    saveSettings((settings) => {
        if (chrome.runtime.lastError) {
            console.log('Chrome Runtime Error', chrome.runtime.lastError.message);
        } else {
            chrome.runtime.sendMessage({ "action": "settings", "type": "general", "settings": settings });
            $('.success').toggleClass('show');
            setTimeout(() => $('.success').toggleClass('show'), 3000);
        }
    });
}

function gotSettings(stored_settings) {
    $("ul").removeClass("disabled");
}

function setupHTML() {
    createOptionList();
    $("ul").addClass("disabled");
    initializeSettings(gotSettings);
    $('.beyond20-option-input').change(save_settings);
    $(".beyond20-options").on("markaChanged", save_settings);
    $(document).on('click', 'a', function (ev) {
        const href = this.getAttribute('href');
        if (href.length > 0 && href != "#") 
            window.open(this.href);
        return false;
    });
}

function setupOptionsMenu() {
    setupHTML();
    $('#save').on('click', save_settings);
    $('#advanced').on('click', (ev) => {
        advancedOptions = !advancedOptions;
        $(ev.target).text(advancedOptions ? "Basic Options" : "Advanced Options");
        setupHTML();
    });
}

setupOptionsMenu();