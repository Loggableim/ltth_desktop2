# Weather Control Plugin

Professional weather effects system for TikTok Live overlays with **WebGL2-accelerated rendering** and guaranteed transparency.

## 🌦️ Features

- **7 Weather Effects**: Rain, Snow, Storm, Fog, Thunder, Sunbeam, Glitch Clouds
- **WebGL2 Renderer**: GPU-accelerated particle systems with instanced rendering
- **Guaranteed Transparency**: Premultiplied alpha blending with Shadow DOM isolation
- **Dual Kawase Bloom**: Professional post-processing with 3-level bloom chain
- **Instanced Rendering**: Efficient particle systems (Rain: 1200 particles, Snow: 700 particles)
- **Performance Optimized**: DPR clamping (max 1.5), particle limits, 60 FPS target
- **Debug Panel**: Real-time FPS, particle counts, transparency verification, initial pixel readback
- **Permission System**: Role-based access control (Followers, Superfans, Subscribers, Team Members, Top Gifters)
- **Rate Limiting**: Configurable spam protection (default: 10 requests/minute)
- **WebSocket Integration**: Real-time event streaming to overlays
- **Flow Actions**: IFTTT automation support
- **Gift Triggers**: Automatic weather effects based on gift value
- **Chat Commands**: Integration with Global Chat Command Engine (GCCE)
- **Configurable**: Intensity, duration, and visual parameters for each effect
- **Security**: Input validation, sanitization, and API key authentication

## 🎨 WebGL2 Renderer

### Technical Features

- **Rendering**: WebGL2-based with premultiplied alpha for perfect transparency in OBS
- **Particle Systems**: Instanced rendering for rain (1200 max), snow (700 max)
- **Post-Processing**: Dual Kawase bloom with 3 iterations, threshold, and additive blending
- **Effects Shaders**: 
  - Rain: Multi-layer streaks with parallax depth
  - Snow: Soft glows with wobble animation and sparkle effects
  - Storm: Rain + wind modulation + lightning bolts with additive bloom
  - Fog: Multi-layer Perlin noise with soft blending
  - Sunbeam: Godrays with warm color grading
  - Lightning: Bolt geometry with screen flash and additive glow
- **Transparency**: 
  - Canvas initialized with `alpha: true` and `premultipliedAlpha: true`
  - Shadow DOM isolation prevents external CSS interference
  - Debug panel shows transparency status and initial pixel RGBA readback
  - All shaders use premultiplied alpha for geometry, additive for glows
- **Performance**: 
  - DPR clamping to max 1.5 for 1080p canvas
  - Particle count limits enforced per effect
  - Optional chroma-key mode (hot-pink background) for browsers without alpha support
  - Framebuffer architecture with efficient bloom passes

## 🚀 Quick Start

### 1. Installation

The plugin is automatically loaded by the plugin loader. Enable it in the dashboard:

1. Navigate to the Dashboard
2. Go to Plugins section
3. Enable "Weather Control"
4. (Optional) Enable "Global Chat Command Engine" for chat commands

### 2. Configuration

Access the configuration panel at:
```
http://localhost:3000/weather-control/ui
```

### 3. OBS Setup

Add the overlay to OBS with proper transparency settings:

#### Step-by-Step Instructions:

1. **Add Browser Source**
   - In OBS, click the **+** button in the Sources panel
   - Select **Browser Source**
   - Give it a name (e.g., "Weather Effects")

2. **Configure Browser Source**
   - **URL**: `http://localhost:3000/weather-control/overlay`
   - **Width**: `1920` (or your stream resolution width)
   - **Height**: `1080` (or your stream resolution height)
   - **FPS**: `60` (or `30` for better performance)
   - ✅ **Check**: "Shutdown source when not visible"
   - ✅ **Check**: "Refresh browser when scene becomes active"
   - ⚠️ **Important**: Leave "Custom CSS" empty (don't add background colors)

3. **Verify Transparency**
   - The overlay should have a **transparent background**
   - Only weather effects (rain, snow, etc.) should be visible
   - If you see a black background, see troubleshooting below

4. **Debug Mode** (Optional)
   - Add `?debug=true` to the URL to see real-time debug information:
     ```
     http://localhost:3000/weather-control/overlay?debug=true
     ```
   - Debug panel shows: FPS, particle count, active effects, canvas transparency status

5. **Performance Tips**
   - Position the browser source in your scene hierarchy appropriately
   - Use "Shutdown source when not visible" to save CPU/GPU when not needed
   - Lower FPS to 30 if you experience performance issues

## 💬 Chat Commands (GCCE Integration)

When both Weather Control and Global Chat Command Engine (GCCE) plugins are enabled, viewers can trigger weather effects via chat commands.

### Commands

#### `/weather <effect> [intensity] [duration]`
Trigger a weather effect on the stream.

**Parameters:**
- `effect` (required): Weather effect name (rain, snow, storm, fog, thunder, sunbeam, glitchclouds)
- `intensity` (optional): Effect intensity 0.0-1.0 (only if enabled in config)
- `duration` (optional): Duration in milliseconds (only if enabled in config)

**Examples:**
```
/weather rain
/weather storm 0.8
/weather snow 0.5 15000
```

#### `/weatherlist`
List all available weather effects.

**Example:**
```
/weatherlist
→ "Available weather effects: 🌧️ rain, ❄️ snow, ⛈️ storm, 🌫️ fog, ⚡ thunder, ☀️ sunbeam, ☁️ glitchclouds"
```

#### `/weatherstop`
Stop all active weather effects (requires subscriber permission or higher).

**Example:**
```
/weatherstop
→ "All weather effects stopped"
```

### Chat Command Configuration

Configure chat commands in the Weather Control settings:

```javascript
chatCommands: {
  enabled: true,                    // Enable/disable chat commands
  requirePermission: true,          // Use permission system for commands
  allowIntensityControl: false,     // Allow users to specify intensity
  allowDurationControl: false       // Allow users to specify duration
}
```

**Security:**
- Permission checks are applied based on plugin settings
- Rate limiting applies to chat commands (same as API)
- Commands are logged for moderation
- Permission denied events are emitted

## 🎨 Weather Effects

### Rain 🌧️
Realistic falling rain with instanced particle rendering and depth layers.
- **Renderer**: WebGL2 instanced geometry
- **Default Intensity**: 0.5
- **Default Duration**: 10 seconds
- **Max Particles**: 1200
- **Layers**: Far/Mid/Near with parallax depth
- **Features**: Multi-speed streaks, wind modulation, premultiplied alpha blending

### Snow ❄️
Gentle snowfall with wobbling particles, soft glows, and sparkle effects.
- **Renderer**: WebGL2 instanced quads
- **Default Intensity**: 0.5
- **Default Duration**: 10 seconds
- **Max Particles**: 700
- **Layers**: 3 depth layers
- **Features**: Rotation animation, wobble physics, occasional sparkles

### Storm ⛈️
Heavy rain with strong winds, lightning bolts, and screen flash effects.
- **Renderer**: WebGL2 combined effects
- **Default Intensity**: 0.7
- **Default Duration**: 8 seconds
- **Max Particles**: 1200 (rain) + lightning geometry
- **Features**: Enhanced rain, lightning bolts with additive bloom, screen flash, wind modulation

### Fog 🌫️
Multi-layer volumetric fog with Perlin noise and soft blending.
- **Renderer**: WebGL2 fullscreen quads with noise texture
- **Default Intensity**: 0.4
- **Default Duration**: 15 seconds
- **Layers**: 2-3 noise layers
- **Features**: Procedural noise texture, scrolling layers, soft alpha blending

### Thunder ⚡
Lightning bolts with screen flash and additive glow.
- **Renderer**: WebGL2 procedural geometry
- **Default Intensity**: 0.8
- **Default Duration**: 5 seconds
- **Features**: Random bolt generation, additive blending, bloom glow, screen flash overlay

### Sunbeam ☀️
Warm godrays with volumetric lighting and color grading.
- **Renderer**: WebGL2 godray shader
- **Default Intensity**: 0.6
- **Default Duration**: 12 seconds
- **Features**: 3 animated beams, warm color grading, additive blending, slow movement

### Glitch Clouds ☁️
Digital glitch effect with colorful noise and RGB chromatic aberration.
- **Renderer**: WebGL2 post-processing effects
- **Default Intensity**: 0.7
- **Default Duration**: 8 seconds
- **Features**: RGB split, digital noise overlay, glitch lines (planned for future update)

## 🔒 Permission System

Configure who can trigger weather effects:

### User Groups
- **Followers**: Users who follow your channel
- **Superfans**: Users with 50+ gifts sent
- **Subscribers**: Team members (level 1+)
- **Team Members**: Users with specific team level
- **Top Gifters**: Top X gifters of the session
- **Point Threshold**: Users with minimum coins/points

### Configuration
```javascript
permissions: {
  enabled: true,
  allowAll: false,
  allowedGroups: {
    followers: true,
    superfans: true,
    subscribers: true,
    teamMembers: true,
    minTeamLevel: 1
  },
  topGifterThreshold: 10, // Top 10 gifters
  minPoints: 0
}
```

## 📡 API Endpoints

### Trigger Weather Effect
```http
POST /api/weather/trigger
Content-Type: application/json
X-Weather-Key: <api-key> (optional, if not using global auth)

{
  "action": "rain",
  "intensity": 0.5,
  "duration": 10000,
  "username": "viewer123",
  "meta": {
    "triggeredBy": "gift",
    "giftName": "rose"
  }
}
```

**Supported Actions**: `rain`, `snow`, `storm`, `fog`, `thunder`, `sunbeam`, `glitchclouds`

**Parameters**:
- `action` (required): Weather effect to trigger
- `intensity` (optional): 0.0 - 1.0 (default: effect's default)
- `duration` (optional): 1000 - 60000 ms (default: effect's default)
- `username` (optional): Username for permission check
- `meta` (optional): Additional metadata

**Response**:
```json
{
  "success": true,
  "event": {
    "type": "weather",
    "action": "rain",
    "intensity": 0.5,
    "duration": 10000,
    "username": "viewer123",
    "meta": {},
    "timestamp": 1234567890
  }
}
```

### Get Configuration
```http
GET /api/weather/config
```

### Update Configuration
```http
POST /api/weather/config
Content-Type: application/json

{
  "enabled": true,
  "rateLimitPerMinute": 10,
  "permissions": { ... },
  "effects": { ... }
}
```

### Get Supported Effects
```http
GET /api/weather/effects
```

### Reset API Key
```http
POST /api/weather/reset-key
```

## ⚡ Flow Actions

Use weather effects in IFTTT flows:

### Action: `weather.trigger`

**Example Flow**: Trigger rain on expensive gift
```json
{
  "trigger_type": "gift",
  "trigger_condition": {
    "operator": ">=",
    "field": "coins",
    "value": 5000
  },
  "actions": [
    {
      "type": "weather.trigger",
      "action": "storm",
      "intensity": 0.8,
      "duration": 10000
    }
  ]
}
```

**Example Flow**: Trigger snow on follow
```json
{
  "trigger_type": "follow",
  "actions": [
    {
      "type": "weather.trigger",
      "action": "snow",
      "intensity": 0.6,
      "duration": 8000
    }
  ]
}
```

## 🎁 Gift Triggers

Weather effects are automatically triggered based on gift value:

| Coins | Effect |
|-------|--------|
| 5000+ | Storm ⛈️ |
| 1000-4999 | Thunder ⚡ |
| 500-999 | Rain 🌧️ |
| 100-499 | Snow ❄️ |

These can be customized in the plugin code.

## 🔐 Security Features

- **Rate Limiting**: Configurable per-user limits (default: 10/minute)
- **Input Validation**: All parameters are validated and sanitized
- **Permission Checks**: Role-based access control
- **API Key Authentication**: Optional separate API key for external access
- **XSS Protection**: Meta data is sanitized to prevent injection
- **Logging**: All weather events are logged

## 🎯 Performance

- **WebGL2 Acceleration**: Hardware-accelerated rendering with instancing
- **FPS Target**: 60 FPS (configurable, option for 30 FPS)
- **DPR Clamping**: Max 1.5 device pixel ratio for 1080p performance
- **Particle Limits**: 
  - Rain: 1200 max (adjustable via intensity)
  - Snow: 700 max (adjustable via intensity)
  - Fog: 2-3 fullscreen quads
- **Bloom Post-Processing**: 3-level dual Kawase bloom chain with threshold
- **Memory Management**: Automatic cleanup of expired effects, framebuffer pooling
- **Instanced Rendering**: Single draw call per particle system
- **No Memory Leaks**: Clean initialization/destruction routines

## 🐛 Debugging

Enable debug mode by adding `?debug=true` to the overlay URL.

Debug panel shows:
- Current FPS and frame time
- Active particle count per system
- Active effects list with intensities
- Draw calls per frame
- Transparency status (Alpha enabled, Premultiplied alpha)
- Initial pixel RGBA readback (should be [0, 0, 0, 0])
- Canvas size and DPR
- WebGL version and context attributes

Console logs show:
- Weather events received
- Effect start/stop with parameters
- Connection status
- Shader compilation status
- Framebuffer creation
- Transparency verification

## 📊 Technical Details

### WebGL2 Rendering Pipeline
1. **Scene Pass**: Render all effects to main framebuffer with premultiplied alpha
   - Fog layers (back to front)
   - Sunbeams (additive blending)
   - Rain particles (instanced)
   - Snow particles (instanced)
   - Lightning bolts (procedural geometry)
2. **Bloom Downsampling**: 3-level pyramid with threshold at first level
3. **Bloom Upsampling**: Dual Kawase blur with increasing radius
4. **Composite**: Combine scene + bloom with optional LUT and chromatic aberration

### Shader Architecture
- **Vertex Shaders**: Transform particles with per-instance attributes (position, rotation, size, alpha)
- **Fragment Shaders**: Material properties with premultiplied alpha output
- **Post-Processing**: Fullscreen quads with texture sampling
- **Instancing**: Single draw call for hundreds of particles

### Transparency System
- Canvas initialized with `alpha: true` and `premultipliedAlpha: true`
- WebGL clearColor set to `(0, 0, 0, 0)` - transparent black
- Shadow DOM isolation prevents external CSS from interfering
- Blending mode: `gl.blendFuncSeparate(ONE, ONE_MINUS_SRC_ALPHA, ONE, ONE_MINUS_SRC_ALPHA)`
- Additive blending for glows: `gl.blendFunc(ONE, ONE)`
- Initial pixel readback verification on startup

### Particle System
- Instanced rendering with dynamic buffers
- Per-instance attributes: position (vec3), data (vec4)
- Physics simulation on CPU: gravity, wind, wobble, rotation
- Depth-based parallax via Z coordinate (0-1 range)
- Automatic particle recycling when out of bounds

### WebSocket Events
- Event: `weather:trigger`
- Format: `{ type, action, intensity, duration, username, meta, timestamp }`
- Auto-reconnect with exponential backoff
- Sync event for permanent effects on connection

## 🔧 Customization

### Adding New Effects

1. Add effect name to `supportedEffects` in `main.js`
2. Add default config in `defaultConfig.effects`
3. Add effect implementation in `overlay.html` effects object
4. Add UI controls in `ui.html`

### Custom Gift Mapping

Edit the `registerTikTokEventHandlers()` function in `main.js`:

```javascript
if (coins >= 10000) {
    weatherAction = 'glitchclouds';
} else if (coins >= 5000) {
    weatherAction = 'storm';
}
// ... add more mappings
```

## 📝 Configuration File

Plugin configuration is stored in the database under key `weather_config`.

Example structure:
```json
{
  "enabled": true,
  "apiKey": "weather_abc123...",
  "useGlobalAuth": true,
  "rateLimitPerMinute": 10,
  "permissions": {
    "enabled": true,
    "allowAll": false,
    "allowedGroups": {
      "followers": true,
      "superfans": true,
      "subscribers": true,
      "teamMembers": true,
      "minTeamLevel": 1
    },
    "topGifterThreshold": 10,
    "minPoints": 0
  },
  "effects": {
    "rain": {
      "enabled": true,
      "defaultIntensity": 0.5,
      "defaultDuration": 10000
    }
    // ... other effects
  }
}
```

## 🆘 Troubleshooting

### Black background in OBS overlay

If you see a black background instead of transparency in OBS:

#### Quick Fixes:
1. **Verify OBS Browser Source Settings**
   - Ensure Width and Height match your canvas resolution (e.g., 1920x1080)
   - DO NOT add any custom CSS (especially background colors)
   - Ensure "Shutdown source when not visible" is checked
   - Try refreshing the browser source (right-click → Refresh)

2. **Check OBS Version**
   - OBS Studio 27.0 or later is recommended for best browser source support
   - Older versions may have transparency issues with HTML5 Canvas
   - Update OBS if you're on an older version

3. **Verify Browser Source URL**
   - URL should be exactly: `http://localhost:3000/weather-control/overlay`
   - No trailing slashes or extra parameters (except `?debug=true` for debugging)
   - Test the URL in a regular browser first - it should show transparent background

4. **Enable Debug Mode**
   - Add `?debug=true` to the URL
   - Check the debug panel for "Canvas Alpha" status - should show "✅ Enabled"
   - Check the browser console (right-click source → Interact → F12) for error messages

5. **Test Canvas Transparency**
   - Open the overlay in Chrome/Edge with debug mode: `http://localhost:3000/weather-control/overlay?debug=true`
   - Look for the log message: "✅ Canvas background is transparent"
   - If it says "Canvas background may not be fully transparent", there's a rendering issue

6. **OBS Browser Source Cache**
   - OBS browser sources cache content aggressively
   - Right-click the browser source → Properties → click "Refresh cache of current page"
   - Or temporarily add `?v=2` to the URL to bust the cache: `http://localhost:3000/weather-control/overlay?v=2`

7. **Hardware Acceleration**
   - In OBS: Settings → Advanced → ensure "Enable Browser Source Hardware Acceleration" is checked
   - Restart OBS after changing this setting

#### Technical Details:
The overlay uses HTML5 Canvas with alpha channel and explicit CSS transparency:
- `<html>` and `<body>` elements: `background: transparent !important`
- Canvas element: `background: transparent !important`
- Canvas 2D context: initialized with `alpha: true` and `premultipliedAlpha: true`
- All rendering uses `ctx.clearRect()` to maintain transparency between frames

If transparency still doesn't work after trying all the above, there may be a system-level graphics driver issue or OBS configuration problem.

### Effects not showing in OBS
1. Check overlay URL is correct
2. Verify Browser Source settings (width, height)
3. Enable debug mode to see if events are received
4. Check browser console in OBS (right-click → Interact)

### Animations not loading correctly
1. **Check GSAP Library**
   - The overlay requires GSAP for smooth animations
   - If GSAP fails to load, you'll see a red error message on the overlay
   - Check that `/gsap/gsap.min.js` is accessible from the server
   - Verify the GSAP package is installed: `npm list gsap` in the `app` directory

2. **Verify Network Connection**
   - Ensure the server is running on `http://localhost:3000`
   - Check that Socket.IO is connected (look for "Connected" status in debug mode)
   - Test the overlay URL in a regular browser first

3. **Check Browser Console**
   - Right-click the OBS browser source → Interact → Press F12
   - Look for JavaScript errors in the Console tab
   - Common errors: GSAP not loaded, Socket.IO connection failed, context initialization failed

### Permission denied errors
1. Verify user is in allowed groups
2. Check permission settings in UI
3. Review server logs for details
4. Ensure user exists in database

### Rate limit errors
1. Adjust rate limit in configuration
2. Wait for rate limit window to reset (1 minute)
3. Check server logs for details

### Effects lagging/stuttering
1. Reduce particle count via intensity
2. Limit number of simultaneous effects
3. Close unnecessary OBS sources
4. Check CPU/GPU usage

## 🧪 Testing

### Transparency Test

A standalone transparency test page is available to verify that canvas transparency works correctly:

```
/app/plugins/weather-control/transparency-test.html
```

Open this file directly in a browser (or serve it via the app) to run automated tests that verify:
- Canvas context initialization with alpha channel
- Premultiplied alpha setting
- Background transparency
- Semi-transparent rendering
- clearRect() transparency maintenance
- HTML/Body element transparency

This test uses a checkerboard background pattern to visually confirm transparency is working.

## 📄 License

Part of Pup Cid's Little TikTok Helper.
Licensed under CC BY-NC 4.0 License.

## 🤝 Contributing

Contributions are welcome! Please follow the existing code style and add tests for new features.

## 📞 Support

For issues and feature requests, please create an issue on GitHub.

---

**Version**: 2.0.0 - WebGL2 Edition
**Author**: Pup Cid  
**Last Updated**: 2026-01-22

## Changelog

### Version 2.0.0 (2026-01-22) - WebGL2 Overhaul

**Major Rewrite**: Complete replacement of Canvas 2D renderer with WebGL2-based system

#### New Features
- **WebGL2 Renderer**: Professional GPU-accelerated particle rendering
- **Instanced Rendering**: Single draw call per particle system (rain: 1200 particles, snow: 700 particles)
- **Dual Kawase Bloom**: 3-level bloom post-processing with threshold and radius control
- **Guaranteed Transparency**: Premultiplied alpha + Shadow DOM isolation + debug readback
- **Advanced Shaders**: 
  - Rain: Depth-layered streaks with wind modulation
  - Snow: Wobble physics with sparkle effects
  - Storm: Combined rain + procedural lightning bolts
  - Fog: Multi-layer Perlin noise with scrolling
  - Sunbeam: Godrays with warm color grading
  - Lightning: Bolt geometry with additive bloom
- **Debug Panel**: 
  - Real-time FPS and frame time monitoring
  - Particle counts per system
  - Draw call tracking
  - Transparency verification (initial pixel RGBA readback)
  - WebGL context attributes display
  - Canvas size and DPR monitoring
- **Performance Optimizations**:
  - DPR clamping to max 1.5 for 1080p
  - Particle count limits per effect
  - Framebuffer pooling for bloom chain
  - Efficient instanced draw calls
  - Delta time normalization for consistent physics

#### Technical Improvements
- Shadow DOM isolation for canvas (prevents external CSS interference)
- Premultiplied alpha blending throughout pipeline
- Proper blend modes: premultiplied for geometry, additive for glows
- Procedural noise texture generation (256x256)
- Framebuffer architecture for post-processing
- Shader compilation with error reporting
- Automatic WebGL2 fallback detection
- Optional chroma-key mode (hot-pink background) for browsers without alpha support

#### Files Changed
- `webgl-renderer.js` - New 1500+ line WebGL2 rendering engine
- `overlay.html` - Rewritten to use WebGL2 renderer with Shadow DOM
- `overlay-canvas2d-backup.html` - Backup of original Canvas 2D implementation
- `README.md` - Updated with WebGL2 technical details

#### Breaking Changes
- Canvas 2D fallback removed (WebGL2 required)
- Some particle visual properties changed due to shader-based rendering
- Debug panel layout redesigned

#### Compatibility
- Requires modern browser with WebGL2 support (Chrome 56+, Firefox 51+, Edge 79+)
- OBS Studio 27.0+ recommended for best browser source transparency
- Backward compatible with all API endpoints and chat commands

### Version 1.0.0 (Previous) - Canvas 2D Implementation
- Initial release with Canvas 2D rendering
- 7 weather effects
- Permission system
- Chat commands via GCCE
- Flow actions
- Gift triggers
