import {App, MarkdownView, Plugin, PluginSettingTab, Setting, TFile} from 'obsidian';

interface MouseWheelZoomSettings {
    initialSize: number;
    modifierKey: ModifierKey;
    stepSize: number;
}

interface HandleZoomParams {
    sizeMatchRegExp: RegExp;
    replaceSizeExist: ReplaceTerm;
    replaceSizeNotExist: ReplaceTerm;
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

/**
 * ReplaceTerm enables us to store the parameters for a replacement to add a new size parameter.
 */
class ReplaceTerm {
    replaceFrom: (oldSize: number) => string;
    replaceWith: (newSize: number) => string;

    constructor(replaceFrom: (oldSize: number) => string, replaceWith: (newSize: number) => string) {
        this.replaceFrom = replaceFrom;
        this.replaceWith = replaceWith;
    }

    public getReplaceFromString(oldSize: number): string {
        return this.replaceFrom(oldSize);
    }

    public getReplaceWithString(newSize: number): string {
        return this.replaceWith(newSize);
    }
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
                this.onConfigKeyUp();
            }
        })

        this.registerDomEvent(document, "wheel", (evt: WheelEvent) => {
            if (this.isKeyHeldDown) {

                // When for example using Alt + Tab to switch between windows, the key is still recognized as held down.
                // We check if the key is really held down by checking if the key is still pressed in the event when the
                // wheel event is triggered.
                if (!this.isConfiguredKeyDown(evt)) {
                    this.onConfigKeyUp();
                    return
                }

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

    /**
     * When the config key is released, we enable the scroll again and reset the key held down flag.
     */
    private onConfigKeyUp() {
        this.isKeyHeldDown = false
        this.enableScroll()
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
        const imageUri = eventTarget.attributes.getNamedItem("src").textContent;
        const activeFile: TFile = await this.getActivePaneWithImage(eventTarget);

        let fileText = await this.app.vault.read(activeFile)
        const originalFileText = fileText;

        // Get paremeters like the regex or the replacement terms based on the fact if the image is locally stored or not.
        const zoomParams: HandleZoomParams = imageUri.includes("http") ? this.getRemoteImageZoomParams(imageUri, fileText) : this.getLocalImageZoomParams(imageUri, fileText);

        // Check if there is already a size parameter for this image.
        const sizeMatches = fileText.match(zoomParams.sizeMatchRegExp);

        // Element already has a size entry
        if (sizeMatches !== null) {
            const oldSize: number = parseInt(sizeMatches[1]);
            let newSize: number = oldSize;
            if (evt.deltaY < 0) {
                newSize += this.settings.stepSize
            } else if (evt.deltaY > 0 && newSize > this.settings.stepSize) {
                newSize -= this.settings.stepSize
            }

            fileText = fileText.replace(zoomParams.replaceSizeExist.getReplaceFromString(oldSize), zoomParams.replaceSizeExist.getReplaceWithString(newSize));
        } else { // Element has no size entry -> give it an initial size
            const initialSize = this.settings.initialSize
            fileText = fileText.replace(zoomParams.replaceSizeNotExist.getReplaceFromString(0), zoomParams.replaceSizeNotExist.getReplaceWithString(initialSize));
        }

        // Save changed size
        if (fileText !== originalFileText) {
            await this.app.vault.modify(activeFile, fileText)
        }

    }


    /**
     * Loop through all panes and get the pane that hosts a markdown file with the image to zoom
     * @param imageElement The HTML Element of the image
     * @private
     */
    private async getActivePaneWithImage(imageElement: Element): Promise<TFile> {
        return new Promise(((resolve, reject) => {
            this.app.workspace.iterateAllLeaves(leaf => {
                if (leaf.view.containerEl.contains(imageElement) && leaf.view instanceof MarkdownView) {
                    resolve(leaf.view.file);
                }
            })

            reject(new Error("No file belonging to the image found"))
        }))
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
    private static getImageNameFromUri(imageUri: string) {
        imageUri = decodeURI(imageUri)
        let imageName = imageUri.match(/([\w\d\s\.]+)\?/)[1];
        // Handle linux not correctly decoding the %2F before the Filename to a \
        if (imageName.substr(0, 2) === "2F") {
            imageName = imageName.slice(2)
        }
        return imageName
    }

    /**
     * Get the parameters needed to handle the zoom for a remote image
     * @param imageUri URI of the image
     * @param fileText content of the current file
     * @returns parameters to handle the zoom
     */
    private getRemoteImageZoomParams(imageUri: string, fileText: string): HandleZoomParams {
        const isInTable = MouseWheelZoomPlugin.isInTable(imageUri, fileText)
        // Separator to use for the replacement
        const sizeSeparator = isInTable ? "\\|" : "|"
        // Separator to use for the regex: isInTable ? \\\| : \|
        const regexSeparator = isInTable ? "\\\\\\|" : "\\|"

        const sizeMatchRegExp = new RegExp(`${regexSeparator}(\\d+)]${escapeRegex("("+imageUri+")")}`);

        const replaceSizeExistFrom = (oldSize: number) => `${sizeSeparator}${oldSize}](${imageUri})`;
        const replaceSizeExistWith = (newSize: number) => `${sizeSeparator}${newSize}](${imageUri})`;

        const replaceSizeNotExistsFrom = (oldSize: number) => `](${imageUri})`;
        const replaceSizeNotExistsWith = (newSize: number) => `${sizeSeparator}${newSize}](${imageUri})`;

        const replaceSizeExist = new ReplaceTerm(replaceSizeExistFrom, replaceSizeExistWith);
        const replaceSizeNotExist = new ReplaceTerm(replaceSizeNotExistsFrom, replaceSizeNotExistsWith);

        return {
            sizeMatchRegExp: sizeMatchRegExp,
            replaceSizeExist: replaceSizeExist,
            replaceSizeNotExist: replaceSizeNotExist,
        }
    }

    /**
     * Get the parameters needed to handle the zoom for a local image
     * @param imageUri URI of the image
     * @param fileText content of the current file
     * @returns parameters to handle the zoom
     */
    private getLocalImageZoomParams(imageUri: string, fileText: string): HandleZoomParams {
        const imageName = MouseWheelZoomPlugin.getImageNameFromUri(imageUri);

        const isInTable = MouseWheelZoomPlugin.isInTable(imageName, fileText)
        // Separator to use for the replacement
        const sizeSeparator = isInTable ? "\\|" : "|"
        // Separator to use for the regex: isInTable ? \\\| : \|
        const regexSeparator = isInTable ? "\\\\\\|" : "\\|"

        const sizeMatchRegExp = new RegExp(`${imageName}${regexSeparator}(\\d+)`);

        const replaceSizeExistFrom = (oldSize: number) => `${imageName}${sizeSeparator}${oldSize}`;
        const replaceSizeExistWith = (newSize: number) => `${imageName}${sizeSeparator}${newSize}`;

        const replaceSizeNotExistsFrom = (oldSize: number) => `${imageName}`;
        const replaceSizeNotExistsWith = (newSize: number) => `${imageName}${sizeSeparator}${newSize}`;

        const replaceSizeExist = new ReplaceTerm(replaceSizeExistFrom, replaceSizeExistWith);
        const replaceSizeNotExist = new ReplaceTerm(replaceSizeNotExistsFrom, replaceSizeNotExistsWith);

        return {
            sizeMatchRegExp: sizeMatchRegExp,
            replaceSizeExist: replaceSizeExist,
            replaceSizeNotExist: replaceSizeNotExist,
        }
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

    private isConfiguredKeyDown(evt: WheelEvent): boolean {
        switch (this.settings.modifierKey) {
            case ModifierKey.ALT:
                return evt.altKey;
            case ModifierKey.CTRL:
                return evt.ctrlKey;
            case ModifierKey.SHIFT:
                return evt.shiftKey;
        }
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

/**
 * Function to escape a string into a valid searchable string for a regex
 * @param string string to escape
 * @returns escaped string
 */
function escapeRegex(string: string) {
    return string.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
}


