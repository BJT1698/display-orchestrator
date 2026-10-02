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
  hardware.graphics = {
    enable = true;
    enable32Bit = true;
  };

  # System state version
  system.stateVersion = "24.05";
}
