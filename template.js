/**
* Magic Custom Event: A GTM template to push custom events and structured data.
* @author Alessandro Salerno
* @version 1.0.0
*/

// --- APIs ---
const queryPermission = require('queryPermission');
const createQueue = require('createQueue');
const logToConsole = require('logToConsole');
const Object = require('Object');
const makeNumber = require('makeNumber');
const makeString = require('makeString');
const JSON = require('JSON');

// --- Inputs ---
const eventName       = data.eventName;
const dataLayerName   = data.dataLayerName || 'dataLayer';
const addEventData   = data.addEventData || false;
const eventParameters = data.varSet;
const debugMode     = data.debugMode || false;

// --- Helper Functions ---

/**
 * Logs a message to the console only if debug mode is enabled.
 */
const log = function (level, message) {
    if (debugMode) {
        logToConsole(level, message);
    }
};

/**
 * Logs the content of a GTM UI table to the console for debugging.
 */
const logTable = function (table, tableName) {
    table.forEach(function (row, i) {
        let logMessage = (tableName ? tableName + ' - ' : '') + 'Row ' + i + ': ';
        Object.keys(row).forEach(function (key) {
            logMessage += key + '=' + row[key] + ' | ';
        });
        log('info', logMessage.slice(0, -2));
    });
};
/**
 * Check for integer strings
 */
const isIntegerString = function (str) {
    if (!str || str.length === 0) {
        return false;
    }
    const num = makeNumber(str);
    // Checks for NaN, ensures it's a whole number (no decimals), and is not negative.
    if (num !== num || num % 1 !== 0 || num < 0) {
        return false;
    }
    return true;
};

/**
 * Sets a nested property on an object using a dot-notation path.
 * It automatically creates objects or arrays and overwrites primitive values if a conflict occurs.
 */
const setNestedValue = function (obj, path, value) {
    // Exit early if input is invalid or path is empty
    if (!obj || typeof path !== 'string' || !path.length) return;

    const keys = path.split('.');
    let current = obj;

    for (let i = 0; i < keys.length - 1; i++) {
        const key = keys[i];
        const nextKey = keys[i + 1];
        const isNextKeyAnIndex = isIntegerString(nextKey);

        const currentLevel = current[key];
        const currentLevelType = typeof currentLevel;
        const isObject = currentLevelType === 'object' && currentLevel !== null;
        
        // Duck-typing: Check if it's an object and has a .push method to identify it as an array.
        const isActualArray = isObject && typeof currentLevel.push === 'function';

        // If the next key is an index, we need an array.
        if (isNextKeyAnIndex) {
            // If the current level is not already an array, overwrite it.
            if (!isActualArray) {
                // Log the overwrite action if a value already exists.
                if (currentLevel !== undefined) {
                    log('warn', 'Data conflict on key "' + key + '": Overwriting existing value "' + currentLevel + '" (type: ' + currentLevelType + ') with an empty Array to allow numeric indexing.');
                }
                current[key] = [];
            }
        } 
        // Otherwise, we need an object.
        else {
            // If the current level is not a non-array object, overwrite it.
            if (!isObject || isActualArray) {
                // Log the overwrite action if a value already exists.
                if (currentLevel !== undefined) {
                    log('warn', 'Data conflict on key "' + key + '": Overwriting existing value (type: ' + (isActualArray ? 'Array' : currentLevelType) + ') with an empty Object.');
                }
                current[key] = {};
            }
        }
        current = current[key];
    }
    current[keys[keys.length - 1]] = value;
};


/**
 * Normalizes a string representing a number, handling both European and US formats.
 * It removes thousand separators and standardizes the decimal separator to a dot (.).
 */
const normalizeNumberString = function(numberString) {

    const hasDots = numberString.indexOf('.') !== -1;
    const hasCommas = numberString.indexOf(',') !== -1;

    // Case 1: Both dots and commas are present
    if (hasDots && hasCommas) {
        const lastDotPosition = numberString.lastIndexOf('.');
        const lastCommaPosition = numberString.lastIndexOf(',');
        
        if (lastCommaPosition > lastDotPosition) { // European format: "1.234,56"
            return numberString.split('.').join('').split(',').join('.');
        } else { // US format: "1,234.56"
            return numberString.split(',').join('');
        }
    }

    // Case 2: Only commas are present
    else if (hasCommas) {
        const commaCount = numberString.split(',').length - 1;
        if (commaCount > 1) { // Multiple commas are thousand separators: "1,234,567"
            return numberString.split(',').join('');
        } else { // A single comma is a decimal separator: "123,45"
            return numberString.split(',').join('.');
        }
    }

    // Case 3: Only dots are present
    else if (hasDots) {
        const dotsCount = numberString.split('.').length - 1;
        if (dotsCount > 1) { // Multiple dots are thousand separators: "1.234.567"
            return numberString.split('.').join('');
        } else { // A single dot is a decimal separator: "123.45"
            return numberString;
        }
    }

    // Case 4: No separators are present
    else {
        return numberString; // The string is a plain integer like "1234".
    }
};


/**
 * Converts a raw value to a specific type based on a user's selection.
 */
const getTypedValue = function (rawValue, desiredType, varName) {
    // If the type is 'inherit' or not specified, return the raw value with its original type.
    if (desiredType === 'inherit' || !desiredType) {
        return rawValue;
    }
    //String conversion and sanitize
    const stringValue = makeString(rawValue).trim();
    switch (desiredType) {
        case 'number':
            // Call the dedicated normalization function
            const normalizedValue = normalizeNumberString(stringValue);
            const numValue = makeNumber(normalizedValue);
            // Check for NaN, which is the result of a failed conversion.
            if (numValue !== numValue) {
                log('warn', 'Value "' + stringValue + '" for key "' + varName + '" could not be converted to a Number and was skipped.');
                return undefined;
            }
            return numValue;
        case 'boolean':
            const lowerCaseValue = stringValue.toLowerCase();
            if (lowerCaseValue === 'true' || lowerCaseValue === '1') {
                return true;
            }
            if (lowerCaseValue === 'false' || lowerCaseValue === '0') {
                return false;
            }
            log('warn', 'Value "' + stringValue + '" for key "' + varName + '" could not be converted to a Boolean and was skipped.');
            return undefined;
        case 'string':
            return stringValue;
    }
    // Fallback for any unexpected 'desiredType' values.
    return rawValue;
};

/**
 * Logs the final, type-converted parameters for debugging.
 */
const logProcessedParameters = function (parameters) {
    let processedLogMessage = 'Event Parameters Processed (with types): ';
    const keys = Object.keys(parameters);
    if (keys.length > 0) {
        keys.forEach(function (key, i) {
            let valueToLog = parameters[key];
            const valueType = typeof valueToLog;
            valueToLog = JSON.stringify(valueToLog);
            processedLogMessage += key + '=' + valueToLog + ' (' + valueType + ')';
            if (i < keys.length - 1) {
                processedLogMessage += ', ';
            }
        });
        log('info', processedLogMessage);
    } else {
        log('info', 'No valid event parameters were processed to be pushed.');
    }
};


// --- MAIN EXECUTION FLOW ---

// Verify permission to access the dataLayer before proceeding.
if (queryPermission('access_globals', 'readwrite', dataLayerName)) {
    // Create the queue for the specified dataLayer.
    const dataLayerPush = createQueue(dataLayerName);
    // Initialize the base event object.
    let eventData = { "event": eventName };
    log('info', 'Preparing to push event: "' + eventName + '" to dataLayer: "' + dataLayerName + '"');
    // Process custom parameters if the user has enabled them.
    if (addEventData) {
        //log event data table if debugMode is active
        if (debugMode) {
            logTable(eventParameters, "Raw Event Parameters Table");
        }
        const finalParameters = {};
        // Loop over each row in the parameter table.
        eventParameters.forEach(function (row) {
            // Call the helper function to convert the raw value to its desired type.
            const typedValue = getTypedValue(row.varValue, row.varType, row.varName);
            // Only add the parameter if the type conversion was successful
            if (typedValue !== undefined) {
                setNestedValue(finalParameters, row.varName, typedValue);
            }
        });
        // Directly assign processed parameters to event object
        Object.keys(finalParameters).forEach(function (key) {
            eventData[key] = finalParameters[key];
        });
        //log processed parameter if debugMode is active
        if (debugMode) {
            // Call the new, isolated logging function.
            logProcessedParameters(finalParameters);
        }
    } else {        
        log('info', ' Pushing basic event only. No event parameters were added ("addEventData" is false)');      
    }
    // Push the final object to the dataLayer.
    dataLayerPush(eventData);
    log('info', 'Event "' + eventName + '" successfully pushed to "' + dataLayerName + '".');    
    // Signal success to GTM.
    data.gtmOnSuccess();
} else {
    // If permission is denied, log an error and signal failure. 
    log('error', 'Permission to access the dataLayer named "' + dataLayerName + '" was not granted.');
    data.gtmOnFailure();
}
