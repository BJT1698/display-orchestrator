# Updates started from the dashboard. The agent runs as the unprivileged kiosk user: it can only
# drop the requested release tag into /var/lib/signage-update/inbox/request. This root service picks
# it up, checks it is a plain release tag, and rebuilds the system from that tag of the official repo.
# Status and log live in the root-owned parent directory, so the kiosk user cannot redirect root's
# writes with symlinks.
{ config, pkgs, lib, ... }:

let
  repo = "github:BJT1698/display-orchestrator";
  stateDir = "/var/lib/signage-update";

  updateScript = pkgs.writeShellScript "signage-update" ''
    set -uo pipefail
    export PATH="${lib.makeBinPath [ config.system.build.nixos-rebuild config.nix.package pkgs.coreutils pkgs.gnugrep pkgs.gawk pkgs.git ]}:$PATH"

    request="${stateDir}/inbox/request"
    status="${stateDir}/status.json"
    # A regular file only (no symlink tricks), and never more than a tag's worth of bytes
    if [ -L "$request" ] || [ ! -f "$request" ]; then
      rm -f "$request"
      exit 0
    fi
    tag="$(head -c 64 "$request" | tr -d '[:space:]')"
    rm -f "$request"

    write_status() { # state target error
      local now; now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
      clean() { printf '%s' "$1" | tr '"\\\n' "'/ " | cut -c1-300; }
      printf '{"state":"%s","target":"%s","error":"%s","at":"%s"}\n' "$1" "$(clean "$2")" "$(clean "$3")" "$now" > "$status.tmp"
      chmod 644 "$status.tmp"
      mv "$status.tmp" "$status"
    }

    # Only release tags of the official repository, nothing else from an untrusted writer
    if ! printf '%s' "$tag" | grep -Eq '^v[0-9]+\.[0-9]+\.[0-9]+$'; then
      write_status failed "$tag" "Not a release tag"
      exit 0
    fi

    write_status running "$tag" ""
    log="${stateDir}/last-update.log"
    if nixos-rebuild switch --refresh --flake "${repo}/$tag?dir=nixos#target-system" > "$log" 2>&1; then
      write_status done "$tag" ""
    else
      write_status failed "$tag" "$(tail -n 3 "$log")"
    fi
  '';
in
{
  # `nix` with flakes, for the rebuild from GitHub (and for maintenance over SSH)
  nix.settings.experimental-features = [ "nix-command" "flakes" ];

  # The kiosk user (agent) may write the request; root reads it and owns the logic
  systemd.tmpfiles.rules = [
    "d ${stateDir} 0755 root root -"
    "d ${stateDir}/inbox 0755 kiosk users -"
  ];

  systemd.paths.signage-update = {
    description = "Watch for display update requests";
    wantedBy = [ "multi-user.target" ];
    pathConfig.PathModified = "${stateDir}/inbox/request";
  };

  systemd.services.signage-update = {
    description = "Update this display to a release requested from the dashboard";
    after = [ "network-online.target" ];
    wants = [ "network-online.target" ];
    serviceConfig = {
      Type = "oneshot";
      ExecStart = updateScript;
      TimeoutStartSec = "2h";
    };
    # The rebuild switches to a new system that may change this very unit: never stop it midway
    restartIfChanged = false;
    stopIfChanged = false;
  };

  # Which release this system was built from, reported to the dashboard by the agent
  environment.etc."signage/version".source = ../VERSION;
}
