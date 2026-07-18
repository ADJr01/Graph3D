import DefaultTheme from 'vitepress/theme';

// Extends (doesn't replace) the default theme — required as soon as
// site/.vitepress/theme/ exists at all, even though GalleryDemo.vue/
// PlaygroundDemo.vue (Prompt 188) are only ever imported directly by the
// .md pages that use them (site/gallery.md, site/playground.md), not
// registered as global components here.
export default DefaultTheme;
