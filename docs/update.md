## Beyond20 has just been installed or updated

Congratulations! Beyond20 was just updated to the latest version : v2.22.0

I hope you like the new features, and hopefully the killer feature you were waiting for was just added.

If you enjoy using Beyond20 and find it useful for your games, please consider [showing your appreciation](/rations) by offering me some rations or your patronage.

Thank you all for your support!

* [Release Notes](#release-notes)
* [Changelog](#changelog)

# Known issues

{% include_relative known_issues.md %}

# Release Notes

v2.22.0 (September 18th 2026)
===

Hi everyone,

This is the Foundry VTT 14 test build of Beyond20. It installs alongside the Chrome Web Store release rather than replacing it, and says so in the D&D Beyond interface so you can tell which one you're using. Please run only one of the two at a time.

This release brings Beyond20 up to date with Foundry VTT 14 and the dnd5e 6 system. Condition syncing, initiative tracking, and whispered and blind rolls all work again, and public rolls show your character's name instead of your user name.

The companion module has been updated to 1.7.0 to match. That fixes it failing to load at all on Foundry 14, adds dark theme colours to the roll cards, and stops it restyling Foundry's own chat cards. The experimental native rolls have been rebuilt for dnd5e 4 and later, and are still switched off by default.

We've also fixed HP syncing writing D&D Beyond's temporary Max HP modifiers over your character's real maximum, so casting Aid no longer changes your Max HP for good.

You can read the full [Changelog](/Changelog#v2220) to see all the changes included in this release.

Thank you to [@0xguy07](https://github.com/0xguy07) for the HP syncing fix!

Enjoy!
=
v2.21.0 (August 25th 2026)
===

Hi everyone,

Today, we're releasing v2.21.0 with a new 2024 Bladesong option for Bladesinger wizards, as well as support for the Unarmed Fighting fighting style, and grave touch lock is not working on D&D Beyond.

We've also fixed versatile weapon quick-rolls, HP updates for legacy Roll20 games, and false-positive dice parsing for sourcebook labels such as D1 and D0.

You can read the full [Changelog](/Changelog#v2210) below to see all the changes included in this release.

As usual, a big thank you to [@dmportella/Gothyl](https://github.com/dmportella), [@jugarrit](https://github.com/jugarrit), and [@0xguy07](https://github.com/0xguy07) for their work on this release!

Enjoy!
=
v2.20.1 (June 7th 2026)
===

Hi everyone,

This time we're releasing a small hotfix for an issue introduced in the previous release. Users on Chrome who had duplicate rolls on Roll20 or who couldn't get their rolls sent to Roll20 after the extension is reloaded (such as after an update), should not be affected by those bugs anymore.

Thank you to [@dmportella/Gothyl](https://github.com/dmportella) and to[@0xguy07](https://github.com/0xguy07) who fixed the issues in this hotfix.

Have fun!
=
v2.20.0 (June 4th 2026)
===

Hi everyone,

Today's release adds a few small bugfixes to Beyond20, but also tackles a recent issue with the Roll20 website now using two slightly different URLs for the games.

This should get rid of the warning users would see, when they access their games through the new URL, which prevented Beyond20 from sending rolls to Roll20. 

You can read the full [Changelog](/Changelog#v2200) below to see all the changes included in this release.

As usual, a big thank you to [@dmportella/Gothyl](https://github.com/dmportella) and to[@raystuart](https://github.com/raystuart) for their work on this release!
Thank you as well to our generous [Patrons](https://patreon.com/kakaroto) and [Ko-fi/Github](/rations) supporters.

Enjoy!

---

Click [here](/release_notes) for the full release notes from previous versions.

# Changelog

v2.22.0 (September 18th 2026)
===
- **Feature**: *FVTT*: Add support for Foundry VTT 14 and the dnd5e 6 system
- **Feature**: *FVTT*: Rebuild the experimental native rolls for dnd5e 4 and later, with items built as Activities (still off by default)
- **Feature**: Mark this build as a test version in the D&D Beyond interface, so it can be told apart from the store release
- **Bugfix**: *FVTT*: Sync conditions through the actor's status effects, which is what Foundry 14 needs, and keep conditions set from inside Foundry
- **Bugfix**: *FVTT*: Fix adding initiative to the combat tracker on Foundry 14
- **Bugfix**: *FVTT*: Fix whispered and blind rolls on Foundry 14, which renamed roll modes to message modes
- **Bugfix**: *FVTT*: Show the character's name on public rolls instead of the user's (#1350)
- **Bugfix**: *FVTT*: Write D&D Beyond's Max HP modifiers to Temp Max HP instead of overwriting Max HP (#1158) (by [@0xguy07](https://github.com/0xguy07))
- **Bugfix**: *FVTT module v1.7.0*: Fix the module failing to load at all on Foundry 14
- **Bugfix**: *FVTT module v1.7.0*: Add dark theme colours to the roll cards, and stop them restyling Foundry's own and dnd5e's chat cards (#1409)
- **Bugfix**: *FVTT module v1.7.0*: Hide the native rolls setting when the D&D 5e system can't support it

v2.21.0 (August 25th 2026)
===
- **Feature**: *dndbeyond*: Add support for the 2024 Wizard: Bladesinger: Bladesong feature (by [@jugarrit](https://github.com/jugarrit))
- **Feature**: *dndbeyond*: Add support for the Unarmed Fighting fighting style (by [@dmportella](https://github.com/dmportella))
- **Bugfix**: *dndbeyond*: Fix versatile weapon quick-rolls selecting the wrong damage type (by [@dmportella](https://github.com/dmportella))
- **Bugfix**: *Roll20*: Fix HP updates for legacy games (by [@dmportella](https://github.com/dmportella))
- **Bugfix**: Fix false-positive dice parsing for bare D1 and D0 labels (by [@0xguy07](https://github.com/0xguy07))

v2.20.1 (June 7th 2026)
===
- **Bugfix**: *Roll20*: Fix duplicate messages in Chrome for Roll20 (by [@dmportella](https://github.com/dmportella))
- **Bugfix**: *Roll20*: Fix detection of some Roll20 tabs when reloading the extension while the Roll20 tab is already open (by [@0xguy07](https://github.com/0xguy07))

v2.20.0 (June 4th 2026)
===
- **Feature**: *Roll20*: Add detection and support for the new Roll20 game URL without a trailing slash (by [@dmportella](https://github.com/dmportella))
- **Bugfix**: Fix support for new Elemental Affinity formula damage (by [@raystuart](https://github.com/raystuart))
- **BugFix**: Fix dice formula parsing when it uses a unicode character for the negative sign (by [@dmportella](https://github.com/dmportella))
- **Bugfix**: Fix support for Versatile weapons and conditional damage for spells (by [@dmportella](https://github.com/dmportella))
- **Bugfix**: Fix display for Toll the Dead spell (by [@dmportella](https://github.com/dmportella))


---

Click [here](/Changelog) for the full Changelog of previous versions.
