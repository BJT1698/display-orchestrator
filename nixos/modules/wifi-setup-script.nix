# Interactive Wi-Fi setup on the console (whiptail + NetworkManager), shared by the
# installer and the first-boot wizard. Usage: signage-wifi-setup [--force]
#   without --force it returns at once when there is no Wi-Fi adapter or the machine is already online.
{ pkgs, lib }:

pkgs.writeShellScriptBin "signage-wifi-setup" ''
  set -uo pipefail
  export PATH="${lib.makeBinPath [ pkgs.networkmanager pkgs.newt pkgs.coreutils pkgs.gnugrep pkgs.gnused pkgs.gawk pkgs.ncurses ]}:$PATH"
  export TERM="''${TERM:-linux}"

  FORCE=0
  [ "''${1:-}" = "--force" ] && FORCE=1

  # NetworkManager may still be starting when we are called early in boot
  for _ in $(seq 1 20); do
    nmcli -t general status >/dev/null 2>&1 && break
    sleep 1
  done

  if ! nmcli -t -f TYPE device 2>/dev/null | grep -qx wifi; then
    [ "$FORCE" -eq 1 ] && whiptail --title "Wi-Fi" --msgbox "No Wi-Fi adapter was found on this machine." 8 60
    exit 0
  fi

  online() {
    nmcli -t -f CONNECTIVITY general 2>/dev/null | grep -qE '^(full|limited)$'
  }

  if [ "$FORCE" -eq 0 ] && online; then
    exit 0
  fi

  nmcli radio wifi on >/dev/null 2>&1 || true

  while true; do
    whiptail --title "Wi-Fi" --infobox "Searching for Wi-Fi networks..." 7 50
    nmcli device wifi rescan >/dev/null 2>&1 || true
    sleep 4

    # One entry per network name, strongest signal first. SSID is the last field so
    # names containing ':' survive; nmcli escapes them as '\:'.
    MENU=()
    declare -A SECURITY=()
    while IFS= read -r line; do
      signal="''${line%%:*}"; rest="''${line#*:}"
      security="''${rest%%:*}"; ssid="''${rest#*:}"
      ssid="$(printf '%s' "$ssid" | sed 's/\\:/:/g')"
      [ -z "$ssid" ] && continue
      [ -n "''${SECURITY[$ssid]+x}" ] && continue
      SECURITY[$ssid]="$security"
      label="$signal%"
      if [ -n "$security" ] && [ "$security" != "--" ]; then label="$label  $security"; else label="$label  open"; fi
      MENU+=("$ssid" "$label")
    done < <(nmcli -t -f SIGNAL,SECURITY,SSID device wifi list 2>/dev/null | sort -t: -k1,1nr)

    MENU+=("[hidden]" "Network not listed (hidden name)")
    MENU+=("[rescan]" "Search again")
    MENU+=("[skip]" "Continue without Wi-Fi")

    CHOICE=$(whiptail --title "Wi-Fi" --menu "Choose the Wi-Fi network for this screen:" 20 72 11 \
      "''${MENU[@]}" 3>&1 1>&2 2>&3) || exit 0

    case "$CHOICE" in
      "[skip]") exit 0 ;;
      "[rescan]") continue ;;
    esac

    HIDDEN=0
    SSID="$CHOICE"
    NEEDS_PASSWORD=1
    if [ "$CHOICE" = "[hidden]" ]; then
      HIDDEN=1
      SSID=$(whiptail --title "Wi-Fi" --inputbox "Network name (SSID):" 9 60 3>&1 1>&2 2>&3) || continue
      [ -z "$SSID" ] && continue
    else
      sec="''${SECURITY[$SSID]:-}"
      { [ -z "$sec" ] || [ "$sec" = "--" ]; } && NEEDS_PASSWORD=0
    fi

    PASSWORD=""
    if [ "$NEEDS_PASSWORD" -eq 1 ]; then
      PASSWORD=$(whiptail --title "Wi-Fi" --passwordbox "Password for \"$SSID\" (leave empty for an open network):" 9 64 3>&1 1>&2 2>&3) || continue
    fi

    whiptail --title "Wi-Fi" --infobox "Connecting to \"$SSID\"..." 7 60
    ARGS=(device wifi connect "$SSID")
    [ -n "$PASSWORD" ] && ARGS+=(password "$PASSWORD")
    [ "$HIDDEN" -eq 1 ] && ARGS+=(hidden yes)

    if ERR=$(nmcli --wait 30 "''${ARGS[@]}" 2>&1); then
      whiptail --title "Wi-Fi" --msgbox "Connected to \"$SSID\".\n\nThe screen will reconnect to it automatically after a restart." 10 64
      exit 0
    fi

    # Do not leave a half-configured profile behind (wrong password, out of range)
    nmcli connection delete id "$SSID" >/dev/null 2>&1 || true
    whiptail --title "Wi-Fi" --msgbox "Could not connect to \"$SSID\".\n\nCheck the password and that the network is in range.\n\n$(printf '%s' "$ERR" | tail -n 2)" 14 70
  done
''
