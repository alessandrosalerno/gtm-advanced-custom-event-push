/**
* Magic Custom Event: A user-friendly GTM template to push custom events and structured data. Supports data type conversion and nested objects via dot notation.
* @author Alessandro Salerno
* @version 1.0.0
*/

// --- GTM APIs ---
const queryPermission = require('queryPermission');
const createQueue = require('createQueue');
const logToConsole = require('logToConsole');
const Object = require('Object');
const assertThat = require('assertThat');
const makeNumber = require('makeNumber');
const JSON = require('JSON');

// --- Helper Functions ---

/**
 * Logs a message to the console only if debug mode is enabled.
 */
const log = function (level, message) {
    if (data.debugMode) {
        logToConsole(level, message);
    }
};

/**
 * Logs the content of a GTM UI table to the console for debugging.
 */
const logTable = function (table, tableName) {
    assertThat(table, 'The provided parameter is not a valid table (array-like).').isDefined().isNotNull().isArray();
    table.forEach(function (row, i) {
        assertThat(row, 'Row ' + i + ' of the table is not a valid object.').isObject();
        let logMessage = (tableName ? tableName + ' - ' : '') + 'Row ' + i + ': ';
        Object.keys(row).forEach(function (key) {
            logMessage += key + '=' + row[key] + ', ';
        });
        log('info', logMessage.slice(0, -2));
    });
};

/**
 * Check for integer strings without Regex or other unavailable APIs.
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
 * Sets a nested property on an object using a dot-notation path, automatically creating arrays for numeric keys (e.g., 'products.0.name').
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

        if (isNextKeyAnIndex) {
            current[key] = current[key] || [];
        } else {
            current[key] = current[key] || {};
        }
        current = current[key];
    }

    current[keys[keys.length - 1]] = value;
};

// --- MAIN EXECUTION FLOW ---

// Get the custom dataLayer name from the UI, or default to 'dataLayer'.
const dataLayerName = data.dataLayerName || 'dataLayer';

// Verify permission to access the dataLayer before proceeding.
if (queryPermission('access_globals', 'readwrite', dataLayerName)) {

    // Create the queue for the specified dataLayer.
    const dataLayerPush = createQueue(dataLayerName);
    // Initialize the base event object.
    let eventData = { "event": data.eventName };

    log('info', 'Preparing to push event: "' + data.eventName + '" to dataLayer: "' + dataLayerName + '"');

    // Process custom parameters if the user has enabled them.
    if (data.addEventData) {

        logTable(data.varSet, "Raw Event Parameters Table");
        const finalParameters = {};

        // Loop over each row in the parameter table.
        data.varSet.forEach(function (row) {
            const rawValue = row.varValue;
            const varName = row.varName;
            const desiredType = row.varType || 'inherit';

            // For specific types, first ensure the value is a string for consistent processing.
            const stringValue = '' + rawValue;
            //Check data type
            switch (desiredType) {
                case 'number':
                    // Normalize European numbers without regex: remove dots, replace decimal comma
                    const normalizedValue = stringValue.split('.').join('').split(',').join('.');

                    const numValue = makeNumber(normalizedValue);
                    // Check for NaN to validate the conversion.
                    if (numValue !== numValue) {
                        log('warn', 'Value "' + stringValue + '" for key "' + varName + '" could not be converted to a Number and was skipped.');
                    } else {
                        setNestedValue(finalParameters, varName, numValue);
                    }
                    break;
                case 'boolean':
                    const lowerCaseValue = stringValue.toLowerCase();
                    // Strictly check for 'true' or 'false' strings.
                    if (lowerCaseValue === 'true' || lowerCaseValue === 'false') {
                        setNestedValue(finalParameters, varName, lowerCaseValue === 'true');
                    } else {
                        log('warn', 'Value "' + stringValue + '" for key "' + varName + '" could not be converted to a Boolean and was skipped.');
                    }
                    break;
                case 'string':
                    setNestedValue(finalParameters, varName, stringValue);
                    break;
                case 'inherit':
                default:
                    setNestedValue(finalParameters, varName, rawValue);
            }
        });

        // Directly assign processed parameters to event object
        Object.keys(finalParameters).forEach(function (key) {
            eventData[key] = finalParameters[key];
        });

        // Log the final, type-converted parameters for debugging.
        let processedLogMessage = 'Event Parameters Processed (with types): ';
        const keys = Object.keys(finalParameters);
        if (keys.length > 0) {
            keys.forEach(function (key, i) {
                let valueToLog = finalParameters[key];
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

    } else {
        
        log('info', ' Pushing basic event only. No event parameters were added ("addEventData" is false)');
        
    }

    // Push the final object to the dataLayer.
    dataLayerPush(eventData);
    log('info', 'Event "' + data.eventName + '" successfully pushed to "' + dataLayerName + '".');
    
    // Signal success to GTM.
    data.gtmOnSuccess();

} else {
    
    // If permission is denied, log an error and signal failure. 
    log('error', 'Permission to access the dataLayer named "' + dataLayerName + '" was not granted.');
    data.gtmOnFailure();

}
