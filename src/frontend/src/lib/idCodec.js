/**
 * ID obfuscation layer using Sqids.
 *
 * Encodes integer IDs → short URL-safe strings for browser URLs.
 * Decodes them back to integers for API calls.
 *
 * IMPORTANT: The backend always uses raw integer IDs.
 * This encoding is ONLY for browser-facing URLs.
 */

import Sqids from "sqids";

const sqids = new Sqids({
    alphabet: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
    minLength: 6,
});

/**
 * Encode a numeric ID to a URL-safe string.
 * @param {number|string} id
 * @returns {string}
 */
export function encodeId(id) {
    const num = Number(id);
    if (!Number.isFinite(num) || num < 0) return String(id);
    return sqids.encode([num]);
}

/**
 * Decode a URL-safe string back to a numeric ID.
 * Falls back to parsing as integer if decoding fails (backward compatibility).
 * @param {string} encoded
 * @returns {number|null}
 */
export function decodeId(encoded) {
    if (!encoded) return null;

    // If it's already a plain integer, return it (backward compat)
    const asInt = Number.parseInt(encoded, 10);
    if (String(asInt) === String(encoded) && Number.isFinite(asInt) && asInt > 0) {
        return asInt;
    }

    try {
        const decoded = sqids.decode(encoded);
        if (decoded.length === 1 && Number.isFinite(decoded[0])) {
            return decoded[0];
        }
    } catch {
        // Fall through
    }

    return null;
}
