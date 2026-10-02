{
  description = "Lightweight Digital Signage NixOS Custom Client Appliance";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-24.05";
  };

  outputs = { self, nixpkgs, ... }@inputs:
    let
      system = "x86_64-linux";
      pkgs = import nixpkgs {
        inherit system;
        config.allowUnfree = true;
      };
    in
    {
      # Live Installer ISO (Build with: nix build .#nixosConfigurations.installer-iso.config.system.build.isoImage -L)
      nixosConfigurations.installer-iso = nixpkgs.lib.nixosSystem {
        inherit system;
        modules = [
          "${nixpkgs}/nixos/modules/installer/cd-dvd/installation-cd-minimal.nix"
          ./hosts/installer-iso/default.nix
        ];
      };

      # Target Installed Appliance System
      nixosConfigurations.target-system = nixpkgs.lib.nixosSystem {
        inherit system;
        modules = [
          ./hosts/target-system/default.nix
        ];
      };
    };
}
