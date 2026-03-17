// Badge icons are file-driven.
// Add an SVG to site-src/badge-icons/ named after the glossary category id
// (for example hero-stat.svg or hero_stat.svg), then rebuild.

const BADGE_ICON_CONTENT_SIZE_BY_VARIANT = Object.freeze({
    inline: 13,
    heading: 15,
    tooltip: 15
});

const BADGE_ICON_ASSET_SIZE_BY_VARIANT = Object.freeze({
    inline: 18,
    heading: 22,
    tooltip: 22
});

export function normalizeBadgeIconKey(value) {
    return String(value || "")
        .trim()
        .toLowerCase()
        .replace(/[\s_]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
}

export function getBadgeIconContentSize(variant = "inline") {
    return BADGE_ICON_CONTENT_SIZE_BY_VARIANT[variant] || BADGE_ICON_CONTENT_SIZE_BY_VARIANT.inline;
}

export function getBadgeIconAssetSize(variant = "inline") {
    return BADGE_ICON_ASSET_SIZE_BY_VARIANT[variant] || BADGE_ICON_ASSET_SIZE_BY_VARIANT.inline;
}

export function getBadgeIconAssetFilename(iconKind, variant = "inline") {
    const normalizedIconKind = normalizeBadgeIconKey(iconKind);
    const size = getBadgeIconAssetSize(variant);
    return `${normalizedIconKind}-${size}.png`;
}

export function getBadgeIconAssetPath(iconKind, variant = "inline", basePath = "") {
    return `${basePath}assets/badges/${getBadgeIconAssetFilename(iconKind, variant)}`;
}

export function getBadgeIconKind(category) {
    if (!category) return null;
    const explicitIconKind = normalizeBadgeIconKey(category.iconKind);
    return explicitIconKind || null;
}
