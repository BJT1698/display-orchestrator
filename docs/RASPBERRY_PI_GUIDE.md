# Raspberry Pi & Native Linux Deployment Guide

This guide covers setting up a Raspberry Pi 4 / 5 or x86 Mini-PC as an appliance display node.

## Method 1: Docker (Fastest)

1. Install Docker on Raspberry Pi OS:
   ```bash
   curl -sSL https://get.docker.com | sh
   sudo usermod -aG docker $USER
   ```
2. Run the display container on the host display:
   ```bash
   xhost +local:root
   docker run -d \
     --name kiosk-display \
     --restart unless-stopped \
     --net=host \
     --privileged \
     -v /tmp/.X11-unix:/tmp/.X11-unix:rw \
     -v /dev/dri:/dev/dri:rw \
     -v /home/pi/signage-cache:/cache \
     -e DISPLAY=:0 \
     -e SERVER_URL="ws://<YOUR_SERVER_IP>:8080/ws" \
     -e CLIENT_NAME="Lobby Pi 5" \
     ghcr.io/display-orchestrator/client:latest
   ```

---

## Method 2: Native Lightweight Service (Zero Overhead)

For ultra-low resource usage (~40MB RAM total):

1. **Install minimal prerequisites**:
   ```bash
   sudo apt-get update
   sudo apt-get install -y chromium-browser unclutter curl nodejs npm
   ```

2. **Clone and setup client**:
   ```bash
   sudo mkdir -p /opt/display-orchestrator
   sudo chown -R $USER:$USER /opt/display-orchestrator
   git clone <repo-url> /opt/display-orchestrator
   cd /opt/display-orchestrator/client/agent
   npm install --omit=dev
   ```

3. **Install Systemd Service for Auto-start on boot**:
   ```bash
   sudo cp /opt/display-orchestrator/deploy/systemd/display-orchestrator-client.service /etc/systemd/system/
   # Edit SERVER_URL in /etc/systemd/system/display-orchestrator-client.service
   sudo systemctl daemon-reload
   sudo systemctl enable --now display-orchestrator-client
   ```

---

## Screen Rotation & Resolution Configuration

### Raspberry Pi 4/5 (Wayland / KMS)
Add or edit `/boot/firmware/cmdline.txt` (or `/boot/config.txt`):
- Portrait orientation (90° clockwise):
  ```ini
  display_hdmi_rotate=1
  ```
- Or via GUI/xrandr on X11:
  ```bash
  xrandr --output HDMI-1 --rotate right
  ```
- Or switch dynamically directly from the Web Orchestrator (*Displays &rarr; Rotate*).
