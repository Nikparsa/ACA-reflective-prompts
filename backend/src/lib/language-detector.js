/**
 * Language Detection Utility
 * Automatically detects programming language based on file extensions and content
 */

const LANGUAGE_CONFIGS = {
  python: {
    extensions: ['.py'],
    testFramework: 'pytest',
    runner: 'python-runner',
    timeout: 60,
    memoryLimit: '512m',
    cpuLimit: '1.0'
  }
  // Future languages can be added here easily
  // java: { extensions: ['.java'], testFramework: 'junit', timeout: 120, ... },
  // javascript: { extensions: ['.js', '.jsx'], testFramework: 'jest', timeout: 90, ... },
  // kotlin: { extensions: ['.kt'], testFramework: 'kotest', timeout: 120, ... },
  // swift: { extensions: ['.swift'], testFramework: 'xctest', timeout: 90, ... },
  // go: { extensions: ['.go'], testFramework: 'testing', timeout: 60, ... },
  // ruby: { extensions: ['.rb'], testFramework: 'rspec', timeout: 90, ... }
};

/**
 * Detect programming language from file list
 * @param {Array} files - Array of file objects with name/path properties
 * @returns {Object} Language configuration or null if not detected
 */
function detectLanguage(files) {
  if (!files || files.length === 0) {
    return null;
  }

  // Count extensions
  const extensionCount = {};
  
  files.forEach(file => {
    const extension = getFileExtension(file.name || file.path);
    if (extension) {
      extensionCount[extension] = (extensionCount[extension] || 0) + 1;
    }
  });

  // Find the most common supported language
  for (const [extension, count] of Object.entries(extensionCount)) {
    for (const [language, config] of Object.entries(LANGUAGE_CONFIGS)) {
      if (config.extensions.includes(extension)) {
        return {
          language,
          confidence: count / files.length,
          config: { ...config }
        };
      }
    }
  }

  return null;
}

/**
 * Get file extension from filename
 * @param {string} filename
 * @returns {string} File extension with dot
 */
function getFileExtension(filename) {
  if (!filename) return '';
  const lastDot = filename.lastIndexOf('.');
  return lastDot !== -1 ? filename.substring(lastDot) : '';
}

/**
 * Get language configuration
 * @param {string} language
 * @returns {Object|null} Language configuration
 */
function getLanguageConfig(language) {
  return LANGUAGE_CONFIGS[language] || null;
}

/**
 * Get all supported languages
 * @returns {Array} Array of supported language names
 */
function getSupportedLanguages() {
  return Object.keys(LANGUAGE_CONFIGS);
}

/**
 * Check if language is supported
 * @param {string} language
 * @returns {boolean}
 */
function isLanguageSupported(language) {
  return language in LANGUAGE_CONFIGS;
}

/**
 * Get file extensions for a language
 * @param {string} language
 * @returns {Array} Array of file extensions
 */
function getLanguageExtensions(language) {
  const config = getLanguageConfig(language);
  return config ? config.extensions : [];
}

/**
 * Validate submission files for a specific language
 * @param {Array} files - Array of file objects
 * @param {string} language - Expected language
 * @returns {Object} Validation result with isValid and errors
 */
function validateSubmission(files, language) {
  const config = getLanguageConfig(language);
  if (!config) {
    return {
      isValid: false,
      errors: [`Unsupported language: ${language}`]
    };
  }

  const errors = [];
  const extensions = getLanguageExtensions(language);
  
  // Check if at least one file has the correct extension
  const hasValidExtension = files.some(file => {
    const ext = getFileExtension(file.name || file.path);
    return extensions.includes(ext);
  });

  if (!hasValidExtension) {
    errors.push(`No files found with extensions: ${extensions.join(', ')}`);
  }

  // Check for required files (language-specific)
  if (language === 'python') {
    const hasSolutionFile = files.some(file => 
      file.name === 'solution.py' || file.name.endsWith('.py')
    );
    if (!hasSolutionFile) {
      errors.push('Python submission must include at least one .py file');
    }
  }

  if (language === 'java') {
    const hasJavaFile = files.some(file => file.name.endsWith('.java'));
    if (!hasJavaFile) {
      errors.push('Java submission must include at least one .java file');
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

module.exports = {
  detectLanguage,
  getLanguageConfig,
  getSupportedLanguages,
  isLanguageSupported,
  getLanguageExtensions,
  validateSubmission
};



