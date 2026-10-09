{ config, pkgs, lib, ... }:

let
  wifiSetup = import ./wifi-setup-script.nix { inherit pkgs lib; };
  firstBootScript = pkgs.writeShellScriptBin "signage-first-boot-wizard" ''
    set -euo pipefail
    # Every tool the script calls must be listed here: systemd units get a minimal PATH
    export PATH="${lib.makeBinPath [ pkgs.newt pkgs.curl pkgs.coreutils pkgs.util-linux pkgs.systemd pkgs.ncurses pkgs.gnugrep ]}:$PATH"

    mkdir -p /etc/signage /var/cache/signage/media

    if [ -f /etc/signage/client.env ]; then
      echo "Configuration already present in /etc/signage/client.env"
      exit 0
    fi

    clear
    whiptail --title "Digital Signage - First Boot Provisioning" \
      --msgbox "Welcome to your new Digital Signage Display Node.\n\nPlease configure the connection to your Server Orchestrator." 10 70

    # Offer Wi-Fi when the screen is not online yet (e.g. no cable); returns at once otherwise
    ${wifiSetup}/bin/signage-wifi-setup || true

    while true; do
      SERVER_IP=$(whiptail --title "Server Orchestrator Address" \
        --inputbox "Enter the Server Orchestrator IP or Hostname (with port):" 10 70 "192.168.1.100:8080" 3>&1 1>&2 2>&3)

      if [ -z "$SERVER_IP" ]; then
        SERVER_IP="192.168.1.100:8080"
      fi

      # Format HTTP & WS endpoints
      HTTP_BASE="http://''${SERVER_IP}"
      WS_URL="ws://''${SERVER_IP}/ws"

      whiptail --title "Testing Connectivity" --infobox "Connecting to ''${HTTP_BASE}/api/health..." 8 60

      if curl -s --connect-timeout 5 "''${HTTP_BASE}/api/health" | grep -q '"status":"ok"'; then
        whiptail --title "Success" --msgbox "Successfully connected to Server Orchestrator at ''${SERVER_IP}!" 8 65
        break
      else
        if ! whiptail --title "Connection Warning" \
          --yesno "Could not reach ''${HTTP_BASE}/api/health.\n\nDo you want to save this server address anyway?" 10 70; then
          continue
        else
          break
        fi
      fi
    done

    CLIENT_NAME=$(whiptail --title "Display Name" \
      --inputbox "Enter a friendly display name for this screen:" 10 70 "Signage-$(uname -n)" 3>&1 1>&2 2>&3)

    if [ -z "$CLIENT_NAME" ]; then
      CLIENT_NAME="Signage-$(uname -n)"
    fi

    DEVICE_UUID=$(uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid)

    # Write configuration
    cat <<EOF > /etc/signage/client.env
SERVER_URL="''${WS_URL}"
CLIENT_NAME="''${CLIENT_NAME}"
DEVICE_UUID="''${DEVICE_UUID}"
AGENT_PORT=9090
CACHE_DIR="/var/cache/signage"
EOF

    chmod 644 /etc/signage/client.env

    whiptail --title "Provisioning Complete" \
      --msgbox "Setup completed!\n\nStarting Kiosk Display Engine..." 8 60

    # The agent may already be running with defaults; restart it to load the new config
    # --no-block: the agent is ordered after this unit, a blocking restart would wait on us forever
    systemctl restart --no-block signage-agent.service || true
  '';
in
{
  environment.systemPackages = [
    firstBootScript
    wifiSetup
    pkgs.newt
    pkgs.curl
  ];

  # Systemd service running on TTY1 if unconfigured
  systemd.services.signage-first-boot = {
    description = "Digital Signage First-Boot Setup Wizard";
    wantedBy = [ "multi-user.target" ];
    # Owns tty1 until it finishes; the kiosk (cage on tty1) starts afterwards
    before = [ "cage-tty1.service" "signage-agent.service" ];
    after = [ "network-online.target" "NetworkManager.service" ];
    wants = [ "network-online.target" ];
    unitConfig = {
      ConditionPathExists = "!/etc/signage/client.env";
    };
    environment.TERM = "linux";
    serviceConfig = {
      Type = "oneshot";
      StandardInput = "tty";
      StandardOutput = "tty";
      StandardError = "tty";
      TTYPath = "/dev/tty1";
      TTYReset = true;
      TTYVHangup = true;
      ExecStart = "${firstBootScript}/bin/signage-first-boot-wizard";
    };
  };
}
