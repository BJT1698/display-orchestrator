{ config, pkgs, lib, ... }:

{
  imports = [
    ../../modules/client-appliance.nix
    ../../modules/first-boot-wizard.nix
    ../../modules/laptop.nix
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

  # Vendor firmware for Wi-Fi (e.g. Intel iwlwifi), Bluetooth and GPU microcode
  hardware.enableRedistributableFirmware = true;

  # Hardware acceleration
  hardware.graphics = {
    enable = true;
    enable32Bit = true;
  };

  # State version of the first install; keep it, it is not the NixOS release in use
  system.stateVersion = "24.05";

  # Remote access: SSH with keys only. Add public keys to nixos/ssh/authorized_keys.
  services.openssh = {
    enable = true;
    settings = {
      PermitRootLogin = "prohibit-password";
      PasswordAuthentication = false;
      KbdInteractiveAuthentication = false;
    };
  };
  users.users.root.openssh.authorizedKeys.keyFiles = [ ../../ssh/authorized_keys ];

  # No root password: the console login is locked, access is only via SSH key
  users.users.root.hashedPassword = "!";
  users.mutableUsers = false;
}
