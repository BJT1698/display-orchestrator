{ config, pkgs, lib, ... }:

{
  imports = [
    ../../modules/installer-script.nix
  ];

  # The base ISO module sets its own name at normal priority
  image.baseName = lib.mkForce "signage-nixos-installer";
  isoImage.volumeID = "SIGNAGE_INSTALLER";
  isoImage.makeEfiBootable = true;
  isoImage.makeUsbBootable = true;

  networking.hostName = "signage-installer";

  # The live ISO ships ZFS support but never imports a ZFS root; opt into the safer 26.11 default
  boot.zfs.forceImportRoot = false;
  networking.networkmanager.enable = true;

  # Include flake source repository into ISO
  isoImage.contents = [
    {
      source = ../../.;
      target = "/iso/flake";
    }
  ];

  # Root auto-login for automated installation
  services.getty.autologinUser = lib.mkForce "root";
  security.sudo.wheelNeedsPassword = false;

  # Basic system utilities
  environment.systemPackages = with pkgs; [
    git
    curl
    vim
    htop
    pciutils
    usbutils
  ];
}
