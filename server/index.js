import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import archiver from 'archiver';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use((req, res, next) => {
  if (process.env.NODE_ENV === 'development' || process.env.DEBUG_API === 'true') {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} body=${JSON.stringify(req.body)}`);
  }
  next();
});
app.use(express.static(path.join(__dirname, '..', 'client', 'build')));

app.get('/status', (req, res) => {
  res.json({
    success: true,
    status: 'ok',
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || 'development',
  });
});

function getPlatformDefaults(platform) {
  const platformMap = {
    windows: { savePath: 'C:\\Users\\[username]\\AppData\\Local\\[game]', lineEnding: '\r\n' },
    android: { savePath: '/storage/emulated/0/Android/data/[game]', lineEnding: '\n' },
    ios: { savePath: '/var/mobile/Containers/Data/Application/[game]', lineEnding: '\n' },
    linux: { savePath: '/home/[username]/.local/share/[game]', lineEnding: '\n' },
    universal: { savePath: '[game_data]', lineEnding: '\n' },
  };
  return platformMap[platform] || platformMap.universal;
}

function convertToCfg(content) {
  return content;
}

function convertToIni(content) {
  return content.replace(/^# /gm, '; ');
}

function convertToJson(configText) {
  const obj = { config: {}, sections: {} };
  const lines = configText.split('\n');
  let currentSection = null;

  lines.forEach((line) => {
    line = line.trim();
    if (line.startsWith('[') && line.endsWith(']')) {
      currentSection = line.slice(1, -1);
      obj.sections[currentSection] = {};
    } else if (line && !line.startsWith('#') && line.includes('=')) {
      const [key, ...valueParts] = line.split('=');
      const value = valueParts.join('=').trim();
      if (currentSection) {
        obj.sections[currentSection][key.trim()] = value;
      } else {
        obj.config[key.trim()] = value;
      }
    }
  });
  return JSON.stringify(obj, null, 2);
}

function convertToYaml(configText) {
  const lines = configText.split('\n');
  const yaml = ['# Game Config (YAML Format)'];
  let currentSection = null;

  lines.forEach((line) => {
    line = line.trim();
    if (line.startsWith('[') && line.endsWith(']')) {
      currentSection = line.slice(1, -1);
      yaml.push(`${currentSection}:`);
    } else if (line && !line.startsWith('#') && line.includes('=')) {
      const [key, ...valueParts] = line.split('=');
      const value = valueParts.join('=').trim();
      yaml.push(`  ${key.trim()}: ${value}`);
    }
  });
  return yaml.join('\n');
}

function convertToXml(configText) {
  const lines = configText.split('\n');
  const xml = ['<?xml version="1.0" encoding="UTF-8"?>', '<config>'];
  let currentSection = null;

  lines.forEach((line) => {
    line = line.trim();
    if (line.startsWith('[') && line.endsWith(']')) {
      if (currentSection) xml.push(`  </${currentSection}>`);
      currentSection = line.slice(1, -1);
      xml.push(`  <${currentSection}>`);
    } else if (line && !line.startsWith('#') && line.includes('=')) {
      const [key, ...valueParts] = line.split('=');
      const value = valueParts.join('=').trim().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      xml.push(`    <${key.trim().replace(/[^a-zA-Z0-9_]/g, '_')}>${value}</${key.trim().replace(/[^a-zA-Z0-9_]/g, '_')}>`);
    }
  });
  if (currentSection) xml.push(`  </${currentSection}>`);
  xml.push('</config>');
  return xml.join('\n');
}

function convertToToml(configText) {
  const lines = configText.split('\n');
  const toml = ['# Game Configuration (TOML)'];
  let currentSection = null;

  lines.forEach((line) => {
    line = line.trim();
    if (line.startsWith('[') && line.endsWith(']')) {
      currentSection = line.slice(1, -1);
      toml.push(`\n[${currentSection}]`);
    } else if (line && !line.startsWith('#') && line.includes('=')) {
      const [key, ...valueParts] = line.split('=');
      const value = valueParts.join('=').trim();
      const isNum = !isNaN(value) && value !== '';
      toml.push(`${key.trim()} = ${isNum ? value : `"${value}"`}`);
    }
  });
  return toml.join('\n');
}

function convertToCsv(configText) {
  const lines = configText.split('\n');
  const csv = ['Section,Key,Value'];

  let currentSection = '';
  lines.forEach((line) => {
    line = line.trim();
    if (line.startsWith('[') && line.endsWith(']')) {
      currentSection = line.slice(1, -1);
    } else if (line && !line.startsWith('#') && line.includes('=')) {
      const [key, ...valueParts] = line.split('=');
      const value = valueParts.join('=').trim().replace(/"/g, '""');
      csv.push(`"${currentSection}","${key.trim()}","${value}"`);
    }
  });
  return csv.join('\n');
}

function convertToEnv(configText) {
  const lines = configText.split('\n');
  const env = ['# Game Configuration (Environment Variables)'];
  let counter = 0;

  lines.forEach((line) => {
    line = line.trim();
    if (line.startsWith('[') && line.endsWith(']')) {
      const section = line.slice(1, -1).toUpperCase().replace(/\s+/g, '_');
      env.push(`# [${section}]`);
    } else if (line && !line.startsWith('#') && line.includes('=')) {
      const [key, ...valueParts] = line.split('=');
      const value = valueParts.join('=').trim();
      const envKey = key.trim().toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_]/g, '');
      env.push(`${envKey}="${value}"`);
    }
  });
  return env.join('\n');
}

function convertToSql(configText) {
  const lines = configText.split('\n');
  const sql = ['CREATE TABLE IF NOT EXISTS game_config (id INTEGER PRIMARY KEY, section TEXT, key TEXT, value TEXT);', ''];
  let currentSection = '';

  lines.forEach((line) => {
    line = line.trim();
    if (line.startsWith('[') && line.endsWith(']')) {
      currentSection = line.slice(1, -1);
    } else if (line && !line.startsWith('#') && line.includes('=')) {
      const [key, ...valueParts] = line.split('=');
      const value = valueParts.join('=').trim().replace(/'/g, "''");
      sql.push(`INSERT INTO game_config (section, key, value) VALUES ('${currentSection}', '${key.trim()}', '${value}');`);
    }
  });
  return sql.join('\n');
}

function convertToLua(configText) {
  const lines = configText.split('\n');
  const lua = ['-- Game Configuration (Lua)', 'local config = {'];
  let currentSection = null;
  const sections = {};

  lines.forEach((line) => {
    line = line.trim();
    if (line.startsWith('[') && line.endsWith(']')) {
      currentSection = line.slice(1, -1);
      sections[currentSection] = {};
    } else if (line && !line.startsWith('#') && line.includes('=')) {
      const [key, ...valueParts] = line.split('=');
      const value = valueParts.join('=').trim();
      if (currentSection) {
        sections[currentSection][key.trim()] = value;
      }
    }
  });

  Object.entries(sections).forEach(([section, values], idx) => {
    lua.push(`  ${section} = {`);
    Object.entries(values).forEach(([k, v], vidx) => {
      const isNum = !isNaN(v) && v !== '';
      const luaVal = isNum ? v : `"${v}"`;
      lua.push(`    ${k} = ${luaVal}${vidx < Object.entries(values).length - 1 ? ',' : ''}`);
    });
    lua.push(`  }${idx < Object.entries(sections).length - 1 ? ',' : ''}`);
  });

  lua.push('}', '', 'return config');
  return lua.join('\n');
}

function sanitizeFolderName(name) {
  return String(name || 'game')
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '')
    .replace(/\s+/g, ' ');
}

const gameConfigPresets = {
  minecraft: {
    defaults: {
      graphics: 'balanced',
      controls: 'classic',
      mods: 'none',
      difficulty: 'normal',
      network: 'stable',
    },
    sections: {
      Graphics: {
        renderDistance: '12',
        fancyGraphics: 'true',
        smoothLighting: 'true',
        clouds: 'fast',
      },
      Controls: {
        invertMouse: 'false',
        sensitivity: '0.5',
        keyForward: 'W',
        keyBack: 'S',
        keyLeft: 'A',
        keyRight: 'D',
      },
      Mods: {
        enabled: 'false',
        modList: 'vanilla',
        modData: 'none',
      },
      Performance: {
        maxFps: '60',
        vSync: 'true',
        particles: 'all',
      },
    },
  },
  fortnite: {
    defaults: {
      graphics: 'high',
      controls: 'gamepad',
      mods: 'none',
      difficulty: 'normal',
      network: 'low_latency',
    },
    sections: {
      Graphics: {
        resolution: '1920x1080',
        quality: 'high',
        viewDistance: 'epic',
        shadows: 'medium',
      },
      Controls: {
        aimAssist: 'true',
        sensitivity: '0.55',
        deadzone: '0.05',
      },
      Mods: {
        enabled: 'false',
        modSupport: 'false',
        modData: 'none',
      },
      Network: {
        pingLimit: '120',
        voiceChat: 'true',
      },
    },
  },
  roblox: {
    defaults: {
      graphics: 'medium',
      controls: 'classic',
      mods: 'none',
      difficulty: 'easy',
      network: 'stable',
    },
    sections: {
      Graphics: {
        qualityLevel: '10',
        fullscreen: 'true',
        textureQuality: 'high',
      },
      Controls: {
        cameraSensitivity: '0.7',
        tapToMove: 'false',
      },
      Mods: {
        enabled: 'false',
        customAssets: 'false',
        modData: 'none',
      },
      Network: {
        chatEnabled: 'true',
        streamingEnabled: 'true',
      },
    },
  },
  freefire: {
    defaults: {
      graphics: 'medium',
      controls: 'shooter',
      mods: 'none',
      difficulty: 'hard',
      network: 'low_latency',
    },
    sections: {
      Graphics: {
        frameRate: '60',
        shadowQuality: 'medium',
        antiAliasing: 'on',
      },
      Controls: {
        recoilControl: 'auto',
        sensitivity: '0.65',
      },
      Mods: {
        enabled: 'false',
        modList: 'official',
        modData: 'none',
      },
      Network: {
        serverRegion: 'auto',
        packetLossCompensation: 'true',
      },
    },
  },
  pubg: {
    defaults: {
      graphics: 'high',
      controls: 'shooter',
      mods: 'none',
      difficulty: 'normal',
      network: 'low_latency',
    },
    sections: {
      Graphics: {
        textureQuality: 'ultra',
        effectsQuality: 'high',
        foliageQuality: 'high',
        viewDistance: 'ultra',
      },
      Controls: {
        aimAssist: 'false',
        mouseSensitivity: '0.45',
      },
      Mods: {
        enabled: 'false',
        modAllowed: 'false',
        modData: 'none',
      },
      Network: {
        autoAdjustPacketRate: 'true',
        voiceChat: 'true',
      },
    },
  },
  callofduty: {
    defaults: {
      graphics: 'high',
      controls: 'shooter',
      mods: 'none',
      difficulty: 'hard',
      network: 'low_latency',
    },
    sections: {
      Graphics: {
        textureQuality: 'high',
        shadowQuality: 'high',
        antiAliasing: 'fxaa',
        ambientOcclusion: 'on',
      },
      Controls: {
        aimDownSightsSensitivity: '0.6',
        sprintBehavior: 'default',
      },
      Mods: {
        enabled: 'false',
        modList: 'none',
        modData: 'none',
      },
      Network: {
        dedicatedServer: 'true',
        voiceChat: 'true',
      },
    },
  },
  '8ballpool': {
    defaults: {
      graphics: 'low',
      controls: 'touch',
      mods: 'none',
      difficulty: 'easy',
      network: 'stable',
    },
    sections: {
      Graphics: {
        quality: 'medium',
        animations: 'on',
      },
      Controls: {
        touchSensitivity: '0.8',
        swipePrecision: 'high',
      },
      Mods: {
        enabled: 'false',
        cheatProtection: 'true',
        modData: 'none',
      },
      Network: {
        matchmaking: 'balanced',
      },
    },
  },
};

function normalizeSetting(value) {
  return String(value || '').trim().toLowerCase();
}

function chooseQualityProfile(value) {
  const normalized = normalizeSetting(value);
  if (normalized.includes('low')) return 'low';
  if (normalized.includes('high')) return 'high';
  if (normalized.includes('ultra')) return 'ultra';
  if (normalized.includes('medium') || normalized.includes('balanced')) return 'medium';
  return 'high';
}

function resolveSensitivity(value, graphics) {
  const normalized = normalizeSetting(value);
  if (normalized.includes('low')) return '0.25';
  if (normalized.includes('high')) return '0.8';
  if (normalized.includes('ultra')) return '1.0';
  if (normalized.includes('medium')) return '0.5';
  if (normalizeSetting(graphics).includes('high')) return '0.7';
  return '0.6';
}

function renderDistanceForQuality(quality) {
  const normalized = normalizeSetting(quality);
  if (normalized.includes('low')) return 'short';
  if (normalized.includes('medium') || normalized.includes('balanced')) return 'normal';
  if (normalized.includes('high')) return 'far';
  if (normalized.includes('ultra')) return 'extreme';
  return 'normal';
}

function shadowQuality(quality) {
  const normalized = normalizeSetting(quality);
  if (normalized.includes('low')) return 'low';
  if (normalized.includes('medium')) return 'medium';
  if (normalized.includes('high') || normalized.includes('ultra')) return 'high';
  return 'medium';
}

function textureQuality(quality) {
  const normalized = normalizeSetting(quality);
  if (normalized.includes('low')) return 'low';
  if (normalized.includes('medium') || normalized.includes('balanced')) return 'high';
  if (normalized.includes('high') || normalized.includes('ultra')) return 'ultra';
  return 'high';
}

function chooseAntiAliasing(quality) {
  const normalized = normalizeSetting(quality);
  if (normalized.includes('low')) return 'off';
  if (normalized.includes('medium')) return 'fxaa';
  if (normalized.includes('high')) return 'msaa';
  if (normalized.includes('ultra')) return 'taa';
  return 'fxaa';
}

function chooseMaxFps(quality) {
  const normalized = normalizeSetting(quality);
  if (normalized.includes('low')) return '60';
  if (normalized.includes('medium')) return '90';
  if (normalized.includes('high')) return '120';
  if (normalized.includes('ultra')) return '144';
  return '60';
}

function chooseShaderQuality(quality) {
  const normalized = normalizeSetting(quality);
  if (normalized.includes('low')) return 'low';
  if (normalized.includes('medium')) return 'medium';
  if (normalized.includes('high')) return 'high';
  if (normalized.includes('ultra')) return 'ultra';
  return 'medium';
}

function appendLargeSection(lines, section, prefix, count, defaultValue) {
  lines.push(`[${section}]`);
  for (let i = 1; i <= count; i += 1) {
    lines.push(`${prefix}${i}=${defaultValue}${i}`);
  }
  lines.push('');
}

function buildConfigContent(game, settings, platform = 'windows') {
  const key = normalizeSetting(game).replace(/\s+/g, '');
  const preset = gameConfigPresets[key] || {
    defaults: {
      graphics: 'medium',
      controls: 'default',
      sensitivity: 'high',
      storage: 'local',
      mods: 'none',
      modData: 'none',
      difficulty: 'normal',
      network: 'stable',
      language: 'en_US',
    },
  };

  const customFields = Array.isArray(settings?.customFields) ? settings.customFields : [];
  const merged = {
    ...preset.defaults,
    ...settings,
  };

  const platformPresets = getPlatformDefaults(platform);
  const gameName = sanitizeFolderName(game);
  let basePath = platformPresets.savePath
    .replace('[username]', process.env.USER || 'user')
    .replace('[game]', gameName)
    .replace('[game_data]', `${gameName}/data`);

  const storagePath = normalizeSetting(merged.storage) === 'cloud'
    ? `${basePath}/cloud`
    : normalizeSetting(merged.storage) === 'ssd'
      ? `${basePath}/ssd`
      : `${basePath}/local`;

  const isMobile = platform === 'android' || platform === 'ios';
  const mobileNote = isMobile ? `# Mobile Config for ${platform.toUpperCase()}\n` : '';

  const initialLines = [
    `${mobileNote}# Advanced config generated for ${game}`,
    `# Platform: ${platform.toUpperCase()}`,
    `# Type: ${key || 'generic'}`,
    `# Generated by Game Config Generator`,
    `# Timestamp: ${new Date().toISOString()}`,
    ``,
    `[General]`,
    `game=${game}`,
    `profile=${chooseQualityProfile(merged.graphics)}`,
    `controls=${merged.controls || preset.defaults.controls}`,
    `sensitivity=${merged.sensitivity || preset.defaults.sensitivity}`,
    `storage=${merged.storage || preset.defaults.storage}`,
    `mods=${merged.mods || preset.defaults.mods}`,
    `modData=${merged.modData || preset.defaults.modData}`,
    `difficulty=${merged.difficulty || preset.defaults.difficulty}`,
    `network=${merged.network || preset.defaults.network}`,
    `language=${merged.language || 'en_US'}`,
    `savePath=${storagePath}`,
    `enableTelemetry=${normalizeSetting(merged.network).includes('stable') ? 'true' : 'false'}`,
    `enableExtendedLogs=true`,
    ``,
    `[Controls]`,
    `controlScheme=${merged.controls || 'default'}`,
    `sensitivityValue=${resolveSensitivity(merged.sensitivity, merged.graphics)}`,
    `invertMouse=${normalizeSetting(merged.controls).includes('invert') ? 'true' : 'false'}`,
    `deadzone=${normalizeSetting(merged.controls).includes('gamepad') ? '0.05' : '0.1'}`,
    `layoutProfile=${normalizeSetting(merged.controls).includes('shooter') ? 'fps' : 'standard'}`,
    ``,
    `[Graphics]`,
    `quality=${chooseQualityProfile(merged.graphics)}`,
    `renderDistance=${renderDistanceForQuality(merged.graphics)}`,
    `shadows=${shadowQuality(merged.graphics)}`,
    `textureQuality=${textureQuality(merged.graphics)}`,
    `vSync=${normalizeSetting(merged.graphics).includes('high') ? 'true' : 'false'}`,
    `antiAliasing=${chooseAntiAliasing(merged.graphics)}`,
    `hdr=${normalizeSetting(merged.graphics).includes('ultra') ? 'true' : 'false'}`,
    `ambientOcclusion=${normalizeSetting(merged.graphics).includes('medium') ? 'ssao' : 'hbao'}`,
    ``,
    `[Mods]`,
    `enabled=${merged.mods && normalizeSetting(merged.mods) !== 'none' ? 'true' : 'false'}`,
    `modList=${merged.mods && normalizeSetting(merged.mods) !== 'none' ? merged.mods : 'vanilla'}`,
    `modData=${merged.modData || 'default'}`,
    `modCompatibility=${merged.modData ? 'custom' : 'standard'}`,
    `modSecurity=${normalizeSetting(merged.mods).includes('unsafe') ? 'disabled' : 'enabled'}`,
    ``,
    `[Storage]`,
    `mode=${merged.storage || 'local'}`,
    `cacheEnabled=${normalizeSetting(merged.storage) === 'local' ? 'true' : 'false'}`,
    `archiveOldConfigs=${normalizeSetting(merged.storage) === 'archive' ? 'true' : 'false'}`,
    `autoSync=${normalizeSetting(merged.storage) === 'cloud' ? 'true' : 'false'}`,
    `compression=${normalizeSetting(merged.storage).includes('cloud') ? 'lz4' : 'zip'}`,
    ``,
    `[Network]`,
    `connection=${merged.network || 'stable'}`,
    `pingLimit=${normalizeSetting(merged.network).includes('low') ? '80' : normalizeSetting(merged.network).includes('high') ? '200' : '120'}`,
    `voiceChat=${normalizeSetting(merged.network).includes('voice') ? 'true' : 'false'}`,
    `matchmaking=${normalizeSetting(merged.network).includes('competitive') ? 'balanced' : 'auto'}`,
    `encryption=${normalizeSetting(merged.network).includes('low_latency') ? 'aes-256' : 'aes-128'}`,
    ``,
    `[Performance]`,
    `maxFps=${chooseMaxFps(merged.graphics)}`,
    `frameRateCap=${normalizeSetting(merged.graphics).includes('ultra') ? '144' : '60'}`,
    `shaderQuality=${chooseShaderQuality(merged.graphics)}`,
    `particleDetail=${normalizeSetting(merged.graphics).includes('low') ? 'medium' : 'high'}`,
    `threadCount=${normalizeSetting(merged.graphics).includes('ultra') ? '12' : '8'}`,
    ``,
  ];

  const advancedLines = [...initialLines];

  appendLargeSection(advancedLines, 'AdvancedModules', 'module', 80, 'enabled');
  appendLargeSection(advancedLines, 'Security', 'policy', 50, 'active');
  appendLargeSection(advancedLines, 'Diagnostics', 'diag', 120, 'true');
  appendLargeSection(advancedLines, 'DebugSettings', 'debugFlag', 100, 'enabled');

  advancedLines.push('[CustomSettings]');
  if (customFields.length) {
    customFields.forEach((field) => {
      const fieldKey = sanitizeFolderName(field.key || 'custom').replace(/\s+/g, '_').toLowerCase();
      advancedLines.push(`${fieldKey}=${field.value || ''}`);
    });
  }
  for (let i = 1; i <= 120; i += 1) {
    advancedLines.push(`customSetting${i}=${key || 'generic'}-${i}-${normalizeSetting(merged.graphics) || 'medium'}`);
  }
  advancedLines.push('');

  advancedLines.push('# End of advanced config');
  return advancedLines.join('\n');
}

app.post('/generate-config', async (req, res) => {
  try {
    const { game, settings, format = 'cfg', platform = 'windows' } = req.body ?? {};
    if (!game || typeof game !== 'string') {
      return res.status(400).json({ success: false, error: 'Missing or invalid game name.' });
    }

    const safeSettings = typeof settings === 'object' && settings !== null ? settings : {};
    const folderName = sanitizeFolderName(game);
    const outputFolder = path.join(__dirname, 'generated', folderName);
    await fs.mkdir(outputFolder, { recursive: true });

    let configContent = buildConfigContent(game, safeSettings, platform);
    
    let formattedContent = configContent;
    let fileExt = 'cfg';
    
    if (format === 'ini') {
      formattedContent = convertToIni(configContent);
      fileExt = 'ini';
    } else if (format === 'json') {
      formattedContent = convertToJson(configContent);
      fileExt = 'json';
    } else if (format === 'yaml') {
      formattedContent = convertToYaml(configContent);
      fileExt = 'yaml';
    } else if (format === 'xml') {
      formattedContent = convertToXml(configContent);
      fileExt = 'xml';
    } else if (format === 'toml') {
      formattedContent = convertToToml(configContent);
      fileExt = 'toml';
    } else if (format === 'csv') {
      formattedContent = convertToCsv(configContent);
      fileExt = 'csv';
    } else if (format === 'env') {
      formattedContent = convertToEnv(configContent);
      fileExt = 'env';
    } else if (format === 'sql') {
      formattedContent = convertToSql(configContent);
      fileExt = 'sql';
    } else if (format === 'lua') {
      formattedContent = convertToLua(configContent);
      fileExt = 'lua';
    }

    const filePath = path.join(outputFolder, `${folderName}.${fileExt}`);
    await fs.writeFile(filePath, formattedContent, 'utf8');

    res.json({
      success: true,
      folder: `generated/${folderName}`,
      files: [`${folderName}.${fileExt}`],
      config: formattedContent,
      format,
      platform,
    });
  } catch (error) {
    console.error('Error generating config:', error);
    res.status(500).json({ success: false, error: error.message || 'Could not generate config files.' });
  }
});

app.post('/download-config', async (req, res) => {
  try {
    const { game, settings, format = 'cfg', platform = 'windows' } = req.body ?? {};
    console.log(`[Download] Format received: "${format}", Game: "${game}", Platform: "${platform}"`);
    
    if (!game || typeof game !== 'string') {
      return res.status(400).json({ success: false, error: 'Missing or invalid game name.' });
    }

    const safeSettings = typeof settings === 'object' && settings !== null ? settings : {};
    let configContent = buildConfigContent(game, safeSettings, platform);
    
    let formattedContent = configContent;
    let fileExt = 'cfg';
    
    if (format === 'ini') {
      formattedContent = convertToIni(configContent);
      fileExt = 'ini';
    } else if (format === 'json') {
      formattedContent = convertToJson(configContent);
      fileExt = 'json';
    } else if (format === 'yaml') {
      formattedContent = convertToYaml(configContent);
      fileExt = 'yaml';
    } else if (format === 'xml') {
      formattedContent = convertToXml(configContent);
      fileExt = 'xml';
    } else if (format === 'toml') {
      formattedContent = convertToToml(configContent);
      fileExt = 'toml';
    } else if (format === 'csv') {
      formattedContent = convertToCsv(configContent);
      fileExt = 'csv';
    } else if (format === 'env') {
      formattedContent = convertToEnv(configContent);
      fileExt = 'env';
    } else if (format === 'sql') {
      formattedContent = convertToSql(configContent);
      fileExt = 'sql';
    } else if (format === 'lua') {
      formattedContent = convertToLua(configContent);
      fileExt = 'lua';
    }
    
    console.log(`[Download] File extension set to: "${fileExt}"`);

    const zipName = `${sanitizeFolderName(game)}-${platform}.zip`;

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipName}"`);

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', (err) => {
      console.error('ZIP archive error:', err);
      res.status(500).end();
    });
    archive.pipe(res);
    archive.append(formattedContent, { name: `${sanitizeFolderName(game)}.${fileExt}` });
    if (Array.isArray(safeSettings.customFields)) {
      safeSettings.customFields.forEach((field, index) => {
        if (field?.key) {
          const keyName = sanitizeFolderName(field.key).replace(/\s+/g, '_');
          archive.append(String(field.value || ''), { name: `custom-${keyName || 'field'}-${index + 1}.txt` });
        }
      });
    }
    await archive.finalize();
  } catch (error) {
    console.error('Error creating ZIP archive:', error);
    res.status(500).json({ success: false, error: error.message || 'Could not create ZIP archive.' });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'client', 'build', 'index.html'));
});

function getLocalIpAddress() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

app.listen(PORT, '0.0.0.0', () => {
  const localIp = getLocalIpAddress();
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Accessible on local network at http://${localIp}:${PORT}`);
});
