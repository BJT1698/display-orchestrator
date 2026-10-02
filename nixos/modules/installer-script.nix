{ config, pkgs, lib, ... }:

let
  installerScript = pkgs.writeShellScriptBin "signage-installer" ''
    set -euo pipefail

    # Ensure required tools are available
    export PATH="${lib.makeBinPath [ pkgs.whiptail pkgs.parted pkgs.dosfstools pkgs.e2fsprogs pkgs.util-linux pkgs.nixos-install-tools pkgs.coreutils pkgs.findutils pkgs.gawk pkgs.systemd ]}:$PATH"

    clear
    whiptail --title "Digital Signage Appliance Installer" \
      --msgbox "Welcome to the Digital Signage Client Appliance Installer.\n\nThis wizard will guide you through installing the custom Kiosk OS onto this machine." 12 70

    # 1. Discover Disks
    DISKS=($(lsblk -d -n -o NAME,TYPE,SIZE,MODEL | grep "disk" | grep -v "loop" | awk '{print "/dev/"$1, "("$3, $4")"}'))
    if [ ''${#DISKS[@]} -eq 0 ]; then
      whiptail --title "Error" --msgbox "No target installation drives detected." 8 50
      exit 1
    fi

    # 2. Disk Selection Dialog
    TARGET_DISK=$(whiptail --title "Select Target Installation Drive" \
      --menu "Choose the disk where Digital Signage Appliance will be installed:" 16 70 6 \
      "''${DISKS[@]}" 3>&1 1>&2 2>&3)

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

    # Handle NVMe vs SATA naming
    if [[ "$TARGET_DISK" =~ nvme ]] || [[ "$TARGET_DISK" =~ mmcblk ]]; then
      BOOT_PART="''${TARGET_DISK}p1"
      ROOT_PART="''${TARGET_DISK}p2"
    else
      BOOT_PART="''${TARGET_DISK}1"
      ROOT_PART="''${TARGET_DISK}2"
    fi

    # 5. Format Filesystems
    whiptail --title "Formatting" --infobox "Formatting filesystems (EFI & Root EXT4)..." 8 60
    mkfs.fat -F32 "$BOOT_PART"
    mkfs.ext4 -F -L "signage-root" "$ROOT_PART"

    # 6. Mount Target
    whiptail --title "Mounting" --infobox "Mounting filesystems to /mnt..." 8 60
    mount "$ROOT_PART" /mnt
    mkdir -p /mnt/boot
    mount "$BOOT_PART" /mnt/boot

    # 7. Execute NixOS Installation
    whiptail --title "Installing NixOS" --infobox "Deploying custom NixOS client appliance image...\nThis may take a few minutes." 8 70

    # Copy flake sources to target
    mkdir -p /mnt/etc/nixos
    if [ -d /iso/flake ]; then
      cp -r /iso/flake/* /mnt/etc/nixos/
    fi

    nixos-install --flake "/mnt/etc/nixos#target-system" --no-root-passwd

    whiptail --title "Success!" \
      --msgbox "Installation completed successfully!\n\nThe system will now reboot into the Digital Signage Appliance." 10 70

    umount -R /mnt || true
    reboot
  '';
in
{
  environment.systemPackages = [
    installerScript
    pkgs.whiptail
    pkgs.parted
    pkgs.dosfstools
    pkgs.e2fsprogs
    pkgs.util-linux
    pkgs.curl
    pkgs.git
  ];

  # Autologin on tty1 to launch the TUI installer automatically
  services.getty.autologinUser = lib.mkDefault "root";
  environment.loginShellInit = ''
    if [ "$(tty)" = "/dev/tty1" ]; then
      signage-installer
    fi
  '';
}
