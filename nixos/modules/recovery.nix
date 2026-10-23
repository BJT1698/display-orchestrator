# Restarting the kiosk or the whole display, asked by the agent: when the picture freezes, from the
# dashboard, or at the scheduled time. As with updates, the agent (kiosk user) can only drop the
# action into /var/lib/signage-recover/inbox/request; this root service reads it, accepts only the
# two known actions, and limits reboots to one every 20 minutes so a fault cannot loop the machine.
{ config, pkgs, lib, ... }:

let
  stateDir = "/var/lib/signage-recover";

  recoverScript = pkgs.writeShellScript "signage-recover" ''
    set -uo pipefail
    export PATH="${lib.makeBinPath [ pkgs.coreutils pkgs.systemd ]}:$PATH"

    request="${stateDir}/inbox/request"
    if [ -L "$request" ] || [ ! -f "$request" ]; then
      rm -f "$request"
      exit 0
    fi
    action="$(head -c 32 "$request" | tr -d '[:space:]')"
    rm -f "$request"

    stamp="${stateDir}/last-reboot"
    case "$action" in
      restart-kiosk)
        echo "Restarting the kiosk"
        systemctl restart cage-tty1.service
        ;;
      reboot)
        last="$(cat "$stamp" 2>/dev/null || echo 0)"
        now="$(date +%s)"
        if [ $((now - last)) -lt 1200 ]; then
          echo "Rebooted less than 20 minutes ago: restarting the kiosk instead"
          systemctl restart cage-tty1.service
        else
          echo "$now" > "$stamp"
          echo "Rebooting the display"
          systemctl reboot
        fi
        ;;
      *)
        echo "Ignoring unknown action: $action"
        ;;
    esac
  '';
in
{
  systemd.tmpfiles.rules = [
    "d ${stateDir} 0755 root root -"
    "d ${stateDir}/inbox 0755 kiosk users -"
  ];

  systemd.paths.signage-recover = {
    description = "Watch for kiosk restart and reboot requests";
    wantedBy = [ "multi-user.target" ];
    pathConfig.PathModified = "${stateDir}/inbox/request";
  };

  systemd.services.signage-recover = {
    description = "Restart the kiosk or reboot the display on request";
    serviceConfig = {
      Type = "oneshot";
      ExecStart = recoverScript;
    };
  };

  # If the whole system hangs (kernel, drivers), the hardware watchdog reboots it
  systemd.settings.Manager = {
    RuntimeWatchdogSec = "60s";
    RebootWatchdogSec = "10min";
  };
}
