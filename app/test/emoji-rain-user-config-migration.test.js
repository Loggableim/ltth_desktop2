/**
 * Test: Emoji Rain User Config Migration
 * 
 * Validates that the emoji-rain plugin properly migrates and saves user emoji mappings:
 * - Migration from old data directory to persistent storage
 * - Migration from user_configs directory to persistent storage (priority)
 * - User configs are saved to both persistent storage and user_configs
 * - Newer user_configs data overwrites older persistent data
 */

const fs = require('fs');
const path = require('path');

describe('Emoji Rain User Config Migration', () => {
  let mainJs;
  const mainPath = path.join(__dirname, '..', 'plugins', 'emoji-rain', 'main.js');

  beforeAll(() => {
    // Load main.js
    mainJs = fs.readFileSync(mainPath, 'utf8');
  });

  describe('Constructor Setup', () => {
    test('should define userMappingsPath for persistent storage', () => {
      expect(mainJs).toContain('this.userMappingsPath = path.join(pluginDataDir, \'users.json\')');
    });

    test('should use ConfigPathManager to get persistent user_configs directory', () => {
      expect(mainJs).toContain('const configPathManager = api.getConfigPathManager()');
      expect(mainJs).toContain('const persistentUserConfigsDir = configPathManager.getUserConfigsDir()');
      expect(mainJs).toContain('this.userConfigMappingsPath = path.join(persistentUserConfigsDir, \'emoji-rain\', \'users.json\')');
    });

    test('should define paths in constructor', () => {
      const constructorMatch = mainJs.match(/constructor\(api\)\s*{[\s\S]*?this\.emojiRainUpload\s*=\s*null;/);
      expect(constructorMatch).toBeTruthy();
      expect(constructorMatch[0]).toContain('userMappingsPath');
      expect(constructorMatch[0]).toContain('userConfigMappingsPath');
      expect(constructorMatch[0]).toContain('configPathManager');
    });
  });

  describe('Migration Logic', () => {
    test('should use instance property userConfigMappingsPath from constructor', () => {
      // Should NOT define it again in migrateOldData
      const migrateMethod = mainJs.match(/async migrateOldData\(\)[\s\S]*?Old files are kept for safety/);
      expect(migrateMethod).toBeTruthy();
      expect(migrateMethod[0]).not.toContain('const userConfigMappingsPath =');
      
      // Should use this.userConfigMappingsPath in the migration method
      expect(mainJs).toContain('if (fs.existsSync(this.userConfigMappingsPath))');
      expect(mainJs).toContain('fs.copyFileSync(this.userConfigMappingsPath, this.userMappingsPath)');
    });

    test('should define old app directory user_configs path for migration', () => {
      expect(mainJs).toContain('const oldAppUserConfigsPath = path.join(__dirname, \'..\'');
      expect(mainJs).toContain('user_configs\', \'emoji-rain\', \'users.json\')');
    });

    test('should prioritize persistent user_configs over old locations', () => {
      const migrationSection = mainJs.match(/\/\/ Migrate user mappings[\s\S]*?if \(migrated\)/);
      expect(migrationSection).toBeTruthy();
      
      // Find Priority 1, Priority 2, and Priority 3 comments
      const hasPriority1 = migrationSection[0].includes('Priority 1: Check persistent user_configs directory');
      const hasPriority2 = migrationSection[0].includes('Priority 2: Check old app directory');
      const hasPriority3 = migrationSection[0].includes('Priority 3: Check old data directory');
      
      expect(hasPriority1).toBe(true);
      expect(hasPriority2).toBe(true);
      expect(hasPriority3).toBe(true);
      
      // Ensure Priority 1 comes before Priority 2 and Priority 3
      const priority1Index = migrationSection[0].indexOf('Priority 1');
      const priority2Index = migrationSection[0].indexOf('Priority 2');
      const priority3Index = migrationSection[0].indexOf('Priority 3');
      expect(priority1Index).toBeLessThan(priority2Index);
      expect(priority2Index).toBeLessThan(priority3Index);
    });

    test('should check if persistent user_configs exists first', () => {
      const migrationSection = mainJs.match(/\/\/ Priority 1:[\s\S]*?else if/);
      expect(migrationSection).toBeTruthy();
      expect(migrationSection[0]).toContain('if (fs.existsSync(this.userConfigMappingsPath))');
    });

    test('should migrate from persistent user_configs when found', () => {
      const userConfigMigration = mainJs.match(/if \(fs\.existsSync\(this\.userConfigMappingsPath\)\)\s*{[\s\S]*?migrated = true;[\s\S]*?}/);
      expect(userConfigMigration).toBeTruthy();
      expect(userConfigMigration[0]).toContain('Migrating user mappings from persistent user_configs');
      expect(userConfigMigration[0]).toContain('fs.copyFileSync(this.userConfigMappingsPath, this.userMappingsPath)');
    });

    test('should migrate from old app user_configs directory', () => {
      expect(mainJs).toContain('Migrating user mappings from old app user_configs directory');
      expect(mainJs).toContain('fs.copyFileSync(oldAppUserConfigsPath, this.userMappingsPath)');
      expect(mainJs).toContain('fs.copyFileSync(oldAppUserConfigsPath, this.userConfigMappingsPath)');
    });

    test('should migrate from old data directory as fallback', () => {
      const oldDataMigration = mainJs.match(/\/\/ Priority 3:[\s\S]*?else if \(fs\.existsSync\(oldMappingsPath\)\)\s*{[\s\S]*?migrated = true;[\s\S]*?}/);
      expect(oldDataMigration).toBeTruthy();
      expect(oldDataMigration[0]).toContain('Migrating user mappings from data directory');
      expect(oldDataMigration[0]).toContain('fs.copyFileSync(oldMappingsPath, this.userMappingsPath)');
    });

    test('should update from newer user_configs if persistent exists', () => {
      expect(mainJs).toContain('If persistent location exists, check if user_configs has newer data');
      expect(mainJs).toContain('if (userConfigStats.mtime > persistentStats.mtime)');
      expect(mainJs).toContain('Updating user mappings from newer user_configs version');
    });

    test('should update from newer old app user_configs if persistent exists', () => {
      expect(mainJs).toContain('Also check old app directory\'s user_configs for migration to persistent location');
      expect(mainJs).toContain('if (oldAppStats.mtime > persistentStats.mtime)');
      expect(mainJs).toContain('Migrating newer user mappings from old app user_configs');
    });

    test('should create directory if not exists before migration', () => {
      expect(mainJs).toContain('const userMappingsDir = path.dirname(this.userMappingsPath)');
      expect(mainJs).toContain('if (!fs.existsSync(userMappingsDir))');
      expect(mainJs).toContain('fs.mkdirSync(userMappingsDir, { recursive: true })');
    });
  });

  describe('Save User Mappings Route', () => {
    test('should save to both persistent storage and user_configs', () => {
      const saveRoute = mainJs.match(/\/\/ Update user emoji mappings[\s\S]*?res\.json\(\{ success: true, message: 'User emoji mappings updated' \}\)/);
      expect(saveRoute).toBeTruthy();
      
      // Should save to persistent storage
      expect(saveRoute[0]).toContain('fs.writeFileSync(this.userMappingsPath');
      
      // Should also save to user_configs
      expect(saveRoute[0]).toContain('fs.writeFileSync(this.userConfigMappingsPath');
    });

    test('should create directories before saving', () => {
      const saveRoute = mainJs.match(/\/\/ Update user emoji mappings[\s\S]*?res\.json\(\{ success: true/);
      expect(saveRoute).toBeTruthy();
      
      // Check for userMappingsDir creation
      expect(saveRoute[0]).toContain('const userMappingsDir = path.dirname(this.userMappingsPath)');
      expect(saveRoute[0]).toContain('fs.mkdirSync(userMappingsDir, { recursive: true })');
      
      // Check for userConfigMappingsDir creation
      expect(saveRoute[0]).toContain('const userConfigMappingsDir = path.dirname(this.userConfigMappingsPath)');
      expect(saveRoute[0]).toContain('fs.mkdirSync(userConfigMappingsDir, { recursive: true })');
    });

    test('should log when saving to both locations', () => {
      const saveRoute = mainJs.match(/\/\/ Update user emoji mappings[\s\S]*?res\.json\(\{ success: true/);
      expect(saveRoute).toBeTruthy();
      expect(saveRoute[0]).toContain('User mappings saved to persistent storage and user_configs');
    });

    test('should emit update event after saving', () => {
      const saveRoute = mainJs.match(/\/\/ Update user emoji mappings[\s\S]*?res\.json\(\{ success: true/);
      expect(saveRoute).toBeTruthy();
      expect(saveRoute[0]).toContain('this.api.emit(\'emoji-rain:user-mappings-update\'');
    });
  });

  describe('Migration Path Locations', () => {
    test('should use correct old data path', () => {
      expect(mainJs).toContain('const oldMappingsPath = path.join(__dirname, \'..\'');
      expect(mainJs).toContain('data\', \'plugins\', \'emojirain\', \'users.json\')');
    });

    test('should use correct user_configs path', () => {
      expect(mainJs).toContain('user_configs\', \'emoji-rain\', \'users.json\')');
    });

    test('should use persistent storage from getPluginDataDir', () => {
      expect(mainJs).toContain('const pluginDataDir = api.getPluginDataDir()');
      expect(mainJs).toContain('this.userMappingsPath = path.join(pluginDataDir, \'users.json\')');
    });
  });

  describe('Migration Log Messages', () => {
    test('should log migration source clearly', () => {
      expect(mainJs).toContain('Migrating user mappings from persistent user_configs');
      expect(mainJs).toContain('Migrating user mappings from old app user_configs directory');
      expect(mainJs).toContain('Migrating user mappings from data directory');
      expect(mainJs).toContain('Updating user mappings from newer user_configs version');
      expect(mainJs).toContain('Migrating newer user mappings from old app user_configs');
    });

    test('should log migration success with paths', () => {
      expect(mainJs).toContain('Migrated user mappings from user_configs to:');
      expect(mainJs).toContain('Migrated user mappings from old app user_configs to:');
      expect(mainJs).toContain('Migrated user mappings from data directory to:');
      expect(mainJs).toContain('Updated user mappings from user_configs to:');
      expect(mainJs).toContain('Migrated user mappings from old app user_configs to persistent storage');
    });

    test('should use appropriate emoji and log levels', () => {
      expect(mainJs).toContain('📦 [EMOJI RAIN]');
      expect(mainJs).toContain('✅ [EMOJI RAIN]');
      expect(mainJs).toContain('💾 [EMOJI RAIN]');
    });
  });
});
