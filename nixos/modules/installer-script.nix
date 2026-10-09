{ config, pkgs, lib, ... }:

let
  repoSource = ../..;
  wifiSetup = import ./wifi-setup-script.nix { inherit pkgs lib; };
  installerScript = pkgs.writeShellScriptBin "signage-installer" ''
    set -euo pipefail

    # Ensure root privileges
    if [ "$(id -u)" -ne 0 ]; then
      exec sudo "$0" "$@"
    fi

    # Ensure required tools are available
    export PATH="${lib.makeBinPath [ pkgs.newt pkgs.parted pkgs.dosfstools pkgs.e2fsprogs pkgs.util-linux pkgs.nixos-install-tools pkgs.coreutils pkgs.findutils pkgs.gawk pkgs.systemd pkgs.git ]}:$PATH"

    clear
    whiptail --title "Digital Signage Appliance Installer" \
      --msgbox "Welcome to the Digital Signage Client Appliance Installer.\n\nThis wizard will guide you through installing the custom Kiosk OS onto this machine." 12 70

    # 0. The installation downloads packages: offer Wi-Fi when there is no wired connection
    ${wifiSetup}/bin/signage-wifi-setup

    # 1. Discover Disks safely without word splitting issues
    MENU_OPTIONS=()
    while read -r name size model; do
      [ -z "$name" ] && continue
      case "$name" in
        fd*|sr*|loop*|zram*|ram*) continue ;;
      esac
      dev="/dev/$name"
      [ -b "$dev" ] || continue
      desc="''${size}"
      if [ -n "$model" ]; then
        desc="''${size} - ''${model}"
      fi
      MENU_OPTIONS+=("$dev" "$desc")
    done < <(lsblk -d -n -o NAME,SIZE,MODEL | grep -v "^fd")

    if [ ''${#MENU_OPTIONS[@]} -eq 0 ]; then
      whiptail --title "Error" --msgbox "No target installation drives detected." 8 50
      exit 1
    fi

    # 2. Disk Selection Dialog
    TARGET_DISK=$(whiptail --title "Select Target Installation Drive" \
      --menu "Choose the disk where Digital Signage Appliance will be installed:" 16 70 6 \
      "''${MENU_OPTIONS[@]}" 3>&1 1>&2 2>&3)

    if [ -z "$TARGET_DISK" ]; then
      whiptail --title "Cancelled" --msgbox "Installation cancelled by user." 8 50
      exit 0
    fi

    # 3. Destructive Warning Confirmation
    if ! whiptail --title "⚠️ WARNING: DESTRUCTIVE ACTION" \
      --yesno "ALL existing data on $TARGET_DISK will be PERMANENTLY ERASED.\n\nAre you sure you want to proceed?" 10 70; then
      whiptail --title "Aborted" --msgbox "Installation aborted." 8 50
      exit 0
    fi

    # 4. Partitioning (GPT + 512MB EFI + Root EXT4)
    whiptail --title "Partitioning" --infobox "Partitioning disk $TARGET_DISK (GPT)..." 8 60

    # Wipe existing partition signatures
    wipefs -a "$TARGET_DISK" || true
    parted -s "$TARGET_DISK" mklabel gpt
    parted -s "$TARGET_DISK" mkpart ESP fat32 1MiB 513MiB
    parted -s "$TARGET_DISK" set 1 esp on
    parted -s "$TARGET_DISK" mkpart primary ext4 513MiB 100%

    partprobe "$TARGET_DISK" || true
    udevadm settle || sleep 2

    # Handle NVMe vs SATA/VirtIO naming
    if [[ "$TARGET_DISK" =~ nvme ]] || [[ "$TARGET_DISK" =~ mmcblk ]]; then
      BOOT_PART="''${TARGET_DISK}p1"
      ROOT_PART="''${TARGET_DISK}p2"
    else
      BOOT_PART="''${TARGET_DISK}1"
      ROOT_PART="''${TARGET_DISK}2"
    fi

    # 5. Format Filesystems
    whiptail --title "Formatting" --infobox "Formatting filesystems (EFI & Root EXT4)..." 8 60
    mkfs.fat -F32 -n "ESP" "$BOOT_PART"
    mkfs.ext4 -F -L "signage-root" "$ROOT_PART"

    # 6. Mount Target
    whiptail --title "Mounting" --infobox "Mounting filesystems to /mnt..." 8 60
    mount "$ROOT_PART" /mnt
    mkdir -p /mnt/boot
    mount "$BOOT_PART" /mnt/boot

    # 7. Execute NixOS Installation
    whiptail --title "Installing NixOS" --infobox "Deploying custom NixOS client appliance image...\nThis may take a few minutes." 8 70

    # Clean and copy embedded flake source directly from Nix store
    mkdir -p /mnt/etc/nixos
    cp -r ${repoSource}/nixos/* /mnt/etc/nixos/
    chmod -R u+w /mnt/etc/nixos

    # Initialize Git repository in /mnt/etc/nixos for Nix Flakes
    (
      cd /mnt/etc/nixos
      git init -b main
      git config user.name "Signage Installer"
      git config user.email "installer@signage.local"
      git add .
      git commit -m "initial installation config" || true
    )

    nixos-install --flake "/mnt/etc/nixos#target-system" --no-root-passwd --no-channel-copy --show-trace

    # Carry Wi-Fi networks configured during installation over to the installed screen
    if ls /etc/NetworkManager/system-connections/*.nmconnection >/dev/null 2>&1; then
      mkdir -p /mnt/etc/NetworkManager/system-connections
      cp /etc/NetworkManager/system-connections/*.nmconnection /mnt/etc/NetworkManager/system-connections/
      chmod 600 /mnt/etc/NetworkManager/system-connections/*.nmconnection
    fi

    whiptail --title "Success!" \
      --msgbox "Installation completed successfully!\n\nThe system will now reboot into the Digital Signage Appliance." 10 70

    umount -R /mnt || true
    reboot
  '';
in
{
  environment.systemPackages = [
    installerScript
    wifiSetup
    pkgs.newt
    pkgs.parted
    pkgs.dosfstools
    pkgs.e2fsprogs
    pkgs.util-linux
    pkgs.curl
    pkgs.git
  ];

  # Autologin on tty1 to launch the TUI installer automatically as root
  services.getty.autologinUser = lib.mkForce "root";
  environment.loginShellInit = ''
    if [ "$(tty)" = "/dev/tty1" ]; then
      signage-installer
    fi
  '';
}
