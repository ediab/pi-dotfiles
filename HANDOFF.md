Context

 We've been auditing and enhancing the user's terminal and shell configuration. Key decisions:

 - pi-ask-user v0.13.0 is installed and functional. Display mode defaults to overlay. Added export
   PI_ASK_USER_DISPLAY_MODE=inline to .zshrc so ask_user renders inline by default.
 - Symlinked ~/.pi/agent/settings.json → ~/dev/configs/pi/settings.json (and extensions/no-footer.ts,
   extensions/statusline.ts) so live pi changes auto-sync to the configs git repo.
 - Ghostty padding bumped from 10/8 to 14/12, added adjust-cell-width = 2.
 - VS Code terminal: removed letterSpacing, kept lineHeight: 1.3. No native padding setting exists.
 - Starship prompt completely rewritten to a 2-color Tokyo Night powerline:
     - Nerd Font chevrons (E0B0/E0B2) for powerline segments — blue (directory) → purple (git + language versions)
     - Removed: time, $fill (dots), all Nerd Font logo/pictogram glyphs (git branch icon, python/rust/node logos, Apple os
        logo, folder icons, lock glyph, gear)
     - Username SSH-only, hostname SSH-only
     - cmd_duration, status, jobs on second line before the ❯ character
     - Clean empty states — no slivers when segments are empty (collapsed to 2 colors avoids the 3-color empty-segment
       issue)

 Files involved:
 - ~/dev/configs/starship.toml (symlinked to ~/.config/starship.toml)
 - ~/dev/configs/.zshrc (symlinked to ~/.zshrc) — added PI_ASK_USER_DISPLAY_MODE=inline
 - ~/dev/configs/ghostty/config (symlinked to ~/.config/ghostty/config) — padding, adjust-cell-width
 - ~/dev/configs/vscode/settings.json (symlinked to VS Code settings) — removed letterSpacing
 - ~/dev/configs/pi/settings.json (symlinked to ~/.pi/agent/settings.json)
 - ~/dev/configs/pi/tokyo-night.json — deleted (unused; theme comes from @firstpick/pi-themes-bundle package)
 - ~/.pi/agent/AGENTS.md and ~/dev/pi-elias/AGENTS.md — added "Dotfiles & configs" section documenting the ~/dev/configs/
   repo and all symlinked files

 All changes committed and pushed to github.com:ediab/configs.git.

 Task

 Summarize all the configuration changes that were implemented across zshrc, starship, ghostty, VS Code terminal, pi-agent
 settings, and the configs repo — in a concise changelog format the user can reference. Include what was added, changed,
 and removed.


 Thinking...

 Configs Changelog

 ### starship.toml

 - Changed — Full rewrite to a 2-color Tokyo Night powerline theme using Nerd Font chevrons (/)
     - Blue (directory) → purple (git + language versions)
 - Removed — time module, $fill, all Nerd Font logo/pictogram glyphs (git branch, python/rust/node logos, Apple logo,
   folder icons, lock, gear)
 - Changed — Username and hostname modules now SSH-only
 - Changed — cmd_duration, status, and jobs moved to a second line before the ❯ character
 - Changed — Empty segments collapse cleanly (2 colors avoids 3-color empty-segment slivers)

 ### .zshrc

 - Added — export PI_ASK_USER_DISPLAY_MODE=inline

 ### ghostty/config

 - Changed — Padding increased from 10/8 to 14/12
 - Added — adjust-cell-width = 2

 ### VS Code settings.json

 - Removed — terminal.integrated.letterSpacing

 ### pi/settings.json

 - Changed — Now symlinked through ~/dev/configs/pi/settings.json (live pi changes auto-sync to the configs repo)

 ### pi/extensions/

 - Changed — no-footer.ts and statusline.ts now symlinked through ~/dev/configs/pi/ (live edits auto-sync)

 ### pi/tokyo-night.json

 - Removed — Deleted (unused; theme comes from @firstpick/pi-themes-bundle)

 ### AGENTS.md (both ~/.pi/agent/ and ~/dev/pi-elias/)

 - Added — "Dotfiles & configs" section documenting the ~/dev/configs/ repo, all symlinked files, and
   vscode/extensions.txt
