import {App, Plugin, PluginSettingTab, Setting} from 'obsidian';

interface MouseWheelZoomSettings {
    initialSize: number;
    modifierKey: ModifierKey;
    stepSize: number;
}

enum ModifierKey {
    ALT = "AltLeft",
    CTRL = "ControlLeft",
    SHIFT = "ShiftLeft"
}

const DEFAULT_SETTINGS: MouseWheelZoomSettings = {
    modifierKey: ModifierKey.ALT,
    stepSize: 25,
    initialSize: 500
}

export default class MouseWheelZoomPlugin extends Plugin {
    settings: MouseWheelZoomSettings;
    isKeyHeldDown = false;

    async onload() {
        await this.loadSettings();

        this.registerDomEvent(document, "keydown", (evt: KeyboardEvent) => {
            if (evt.code === this.settings.modifierKey.toString()) {
                this.isKeyHeldDown = true
                this.disableScroll()
            }
        })

        this.registerDomEvent(document, "keyup", (evt: KeyboardEvent) => {
            if (evt.code === this.settings.modifierKey.toString()) {
                this.isKeyHeldDown = false
                this.enableScroll()
            }
        })

        this.registerDomEvent(document, "wheel", (evt: WheelEvent) => {
            if (this.isKeyHeldDown) {
                const eventTarget = evt.target as Element;
                if (eventTarget.nodeName === "IMG") {
                    // Handle the zooming of the image
                    this.handleZoom(evt, eventTarget);
                }
            }
        })

        this.addSettingTab(new MouseWheelZoomSettingsTab(this.app, this));

        console.log("Loaded: Mousewheel image zoom")
    }


    onunload() {
        // Re-enable the normal scrolling behaviour when the plugin unloads
        this.enableScroll()
    }

    /**
     * Handles zooming with the mousewheel on an image
     * @param evt wheel event
     * @param eventTarget targeted image element
     * @private
     */
    private async handleZoom(evt: WheelEvent, eventTarget: Element) {
        const imageName = MouseWheelZoomPlugin.getImageNameFromUrl(eventTarget.attributes.getNamedItem("src").textContent);
        const activeFile = this.app.workspace.getActiveFile();

        let fileText = await this.app.vault.read(activeFile)

        const isInTable = MouseWheelZoomPlugin.isInTable(imageName, fileText)
        // Separator to use for the replacement
        const sizeSeparator = isInTable ? "\\|" : "|"
        // Separator to use for the regex: isInTable ? \\\| : \|
        const regexSeparator = isInTable ? "\\\\\\|" : "\\|"
        const sizeMatches = fileText.match(new RegExp(`${imageName}${regexSeparator}(\\d+)`))

        // Element already has a size entry
        if (sizeMatches !== null) {
            const oldSize: number = parseInt(sizeMatches[1]);
            let newSize: number = oldSize;
            if (evt.deltaY < 0) {
                newSize += this.settings.stepSize
            } else if (evt.deltaY > 0) {
                newSize -= this.settings.stepSize
            }

            fileText = fileText.replace(`${imageName}${sizeSeparator}${oldSize}`, `${imageName}${sizeSeparator}${newSize}`)
        } else { // Element has no size entry -> give it an initial size
            const initialSize = this.settings.initialSize
            fileText = fileText.replace(`${imageName}`, `${imageName}${sizeSeparator}${initialSize}`)
        }

        // Save changed size
        await this.app.vault.modify(activeFile, fileText)
    }

    /**
     * For a given file content decide if a string is inside a table
     * @param searchString string
     * @param fileValue file content
     * @private
     */
    private static isInTable(searchString: string, fileValue: string) {
        return fileValue.search(new RegExp(`^\\|.+${searchString}.+\\|$`, "m")) !== -1
    }


    /**
     * Get the image name from a given src uri
     * @param imageUri uri of the image
     * @private
     */
    private static getImageNameFromUrl(imageUri: string) {
        imageUri = decodeURI(imageUri)
        let imageName = imageUri.match(/([\w\d\s\.]+)\?/)[1];
        // Handle linux not correctly decoding the %2F before the Filename to a \
        if (imageName.substr(0, 2) === "2F") {
            imageName = imageName.slice(2)
        }
        return imageName
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    // Utilities to disable and enable scrolling //

    preventDefault(e: any) {
        e.preventDefault();
    }

    wheelOpt = {passive: false}
    wheelEvent = 'wheel'

    /**
     * Disables the normal scroll event
     */
    disableScroll() {
        window.addEventListener(this.wheelEvent, this.preventDefault, this.wheelOpt);
    }

    /**
     * Enables the normal scroll event
     */
    enableScroll() {
        window.removeEventListener(this.wheelEvent, this.preventDefault, this.wheelOpt as any);
    }

}

class MouseWheelZoomSettingsTab extends PluginSettingTab {
    plugin: MouseWheelZoomPlugin;

    constructor(app: App, plugin: MouseWheelZoomPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        let {containerEl} = this;

        containerEl.empty();

        containerEl.createEl('h2', {text: 'Settings for mousewheel zoom'});


        new Setting(containerEl)
            .setName('Trigger Key')
            .setDesc('Key that needs to be pressed down for mousewheel zoom to work.')
            .addDropdown(dropdown => dropdown
                .addOption(ModifierKey.CTRL, "Ctrl")
                .addOption(ModifierKey.ALT, "Alt")
                .addOption(ModifierKey.SHIFT, "Shift")
                .setValue(this.plugin.settings.modifierKey)
                .onChange(async (value) => {
                    this.plugin.settings.modifierKey = value as ModifierKey;
                    await this.plugin.saveSettings()
                })
            );

        new Setting(containerEl)
            .setName('Step size')
            .setDesc('Step value by which the size of the image should be increased/decreased')
            .addSlider(slider => {
                slider
                    .setValue(25)
                    .setLimits(0, 100, 1)
                    .setDynamicTooltip()
                    .setValue(this.plugin.settings.stepSize)
                    .onChange(async (value) => {
                        this.plugin.settings.stepSize = value
                        await this.plugin.saveSettings()
                    })
            })

        new Setting(containerEl)
            .setName('Initial Size')
            .setDesc('Initial image size if no size was defined beforehand')
            .addSlider(slider => {
                slider
                    .setValue(500)
                    .setLimits(0, 1000, 25)
                    .setDynamicTooltip()
                    .setValue(this.plugin.settings.stepSize)
                    .onChange(async (value) => {
                        this.plugin.settings.initialSize = value
                        await this.plugin.saveSettings()
                    })
            })
    }
}
