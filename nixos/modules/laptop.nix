# Running a screen from a laptop: keep working with the lid closed, and show the kiosk only on
# the external display (HDMI/DisplayPort) when one is connected, never spread across both.
{ config, pkgs, lib, ... }:

let
  # Force the built-in panel "disconnected" while an external display is connected, and let the
  # kernel detect it again once none is. Cage (-m last) follows these hotplug events by itself.
  displaySelect = pkgs.writeShellScript "signage-display-select" ''
    external=0
    for c in /sys/class/drm/card*-*; do
      [ -e "$c/status" ] || continue
      name="''${c##*/}"; name="''${name#*-}"
      case "$name" in eDP*|LVDS*|DSI*|Writeback*) continue ;; esac
      [ "$(cat "$c/status")" = connected ] && external=1
    done

    for c in /sys/class/drm/card*-eDP* /sys/class/drm/card*-LVDS* /sys/class/drm/card*-DSI*; do
      [ -e "$c/status" ] || continue
      current="$(cat "$c/status")"
      if [ "$external" -eq 1 ]; then
        [ "$current" != disconnected ] && echo off > "$c/status"
      else
        # A panel we forced off reads "disconnected"; ask the kernel to probe it again
        [ "$current" = disconnected ] && echo detect > "$c/status"
      fi
    done
    exit 0
  '';
in
{
  # Lid closed means nothing: no suspend, whether on battery, on power or docked
  services.logind.settings.Login = {
    HandleLidSwitch = "ignore";
    HandleLidSwitchExternalPower = "ignore";
    HandleLidSwitchDocked = "ignore";
    IdleAction = "ignore";
  };

  # And nothing else may put the screen to sleep either
  systemd.targets.sleep.enable = false;
  systemd.targets.suspend.enable = false;
  systemd.targets.hibernate.enable = false;
  systemd.targets.hybrid-sleep.enable = false;

  # Runs at boot (add) and on every hotplug (change); idempotent, so its own writes settle at once
  services.udev.extraRules = ''
    ACTION=="add|change", SUBSYSTEM=="drm", KERNEL=="card[0-9]*", RUN+="${displaySelect}"
  '';

  # Only one output at a time: the most recently connected one (the external display)
  services.cage.extraArguments = lib.mkAfter [ "-m" "last" ];
}
