{ config, pkgs, lib, ... }:

{
  imports = [
    ../../modules/installer-script.nix
  ];

  isoImage.isoBaseName = "signage-nixos-installer";
  isoImage.volumeID = "SIGNAGE_INSTALLER";
  isoImage.makeEfiBootable = true;
  isoImage.makeUsbBootable = true;

  networking.hostName = "signage-installer";
  networking.wireless.enable = false;
  networking.networkmanager.enable = true;

  # Include flake source repository into ISO
  isoImage.contents = [
    {
      source = ../../.;
      target = "/iso/flake";
    }
  ];

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
