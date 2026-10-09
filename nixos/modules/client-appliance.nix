{ config, pkgs, lib, ... }:

let
  clientDir = ../client;
  agentApp = pkgs.writeShellScriptBin "signage-agent-runner" ''
    set -euo pipefail

    if [ -f /etc/signage/client.env ]; then
      set -a
      source /etc/signage/client.env
      set +a
    fi

    export CACHE_DIR="''${CACHE_DIR:-/var/cache/signage}"
    export AGENT_PORT="''${AGENT_PORT:-9090}"
    export SERVER_URL="''${SERVER_URL:-ws://10.0.2.2:8080/ws}"
    export CLIENT_NAME="''${CLIENT_NAME:-Signage-Kiosk}"

    mkdir -p "$CACHE_DIR/media"

    SCRIPT_PATH="${clientDir}/agent/main.py"
    if [ -f /etc/signage/main.py ]; then
      SCRIPT_PATH="/etc/signage/main.py"
    fi

    exec ${pkgs.python3.withPackages (ps: [ ps.websockets ])}/bin/python3 "$SCRIPT_PATH"
  '';
in
{
  # Hardened non-root kiosk user
  users.users.kiosk = {
    isNormalUser = true;
    home = "/home/kiosk";
    description = "Signage Kiosk Display User";
    extraGroups = [ "video" "audio" "input" "render" ];
  };

  # Hardware acceleration & Wayland packages
  environment.systemPackages = [
    pkgs.cage
    pkgs.chromium
    pkgs.mesa
    pkgs.libva
    pkgs.python3
    (pkgs.python3.withPackages (ps: [ ps.websockets ]))
    agentApp
  ];

  # Cage Wayland Compositor running Chromium Kiosk
  services.cage = {
    enable = true;
    user = "kiosk";
    program = "${pkgs.chromium}/bin/chromium --no-sandbox --ozone-platform=wayland --enable-features=UseOzonePlatform --kiosk --noerrdialogs --disable-infobars --check-for-update-interval=31536000 --overscroll-history-navigation=0 --disable-pinch --disable-session-crashed-bubble --autoplay-policy=no-user-gesture-required --remote-debugging-port=9222 --user-data-dir=/home/kiosk/.config/chromium-kiosk --app=http://localhost:9090";
    extraArguments = [ "-s" ]; # Silent mode
  };

  # Background Signage Agent Service
  systemd.services.signage-agent = {
    description = "Digital Signage Local Agent Service";
    wantedBy = [ "multi-user.target" ];
    after = [ "network-online.target" ];
    wants = [ "network-online.target" ];
    serviceConfig = {
      Type = "simple";
      User = "kiosk";
      Group = "users";
      WorkingDirectory = "/var/cache/signage";
      ExecStart = "${agentApp}/bin/signage-agent-runner";
      Restart = "always";
      RestartSec = "3s";
    };
  };

  # Ensure cache directory permissions
  systemd.tmpfiles.rules = [
    "d /var/cache/signage 0755 kiosk users -"
    "d /var/cache/signage/media 0755 kiosk users -"
    "d /opt/signage 0755 root root -"
  ];

  # Disable power management / blanking
  powerManagement.enable = false;
}
