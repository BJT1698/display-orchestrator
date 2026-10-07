{ config, pkgs, lib, ... }:

{
  imports = [
    ../../modules/client-appliance.nix
    ../../modules/first-boot-wizard.nix
  ];

  # Bootloader Configuration
  boot.loader.systemd-boot.enable = true;
  boot.loader.efi.canTouchEfiVariables = true;
  boot.loader.timeout = 1;

  # Hardware block drivers for Stage 1 (VirtIO, NVMe, SATA, USB)
  boot.initrd.availableKernelModules = [
    "virtio_net" "virtio_pci" "virtio_mmio" "virtio_blk" "virtio_scsi"
    "ahci" "xhci_pci" "nvme" "usbhid" "usb_storage" "sd_mod" "sr_mod" "ata_piix"
  ];

  # Filesystem mounts (configured by installer script)
  fileSystems."/" = {
    device = "/dev/disk/by-label/signage-root";
    fsType = "ext4";
  };

  fileSystems."/boot" = {
    device = "/dev/disk/by-label/ESP";
    fsType = "vfat";
  };

  # Hostname & Networking
  networking.hostName = "signage-node";
  networking.networkmanager.enable = true;
  networking.useDHCP = lib.mkDefault true;

  # Timezone & Locale
  time.timeZone = "UTC";
  i18n.defaultLocale = "en_US.UTF-8";

  # Hardware acceleration
  hardware.opengl = {
    enable = true;
    driSupport = true;
    driSupport32Bit = true;
  };

  # System state version
  system.stateVersion = "24.05";

  # Enable OpenSSH remote access
  services.openssh = {
    enable = true;
    settings.PermitRootLogin = "yes";
    settings.PermitEmptyPasswords = "yes";
  };
  users.users.root.initialHashedPassword = "";
}
