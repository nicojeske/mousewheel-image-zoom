import {App, Plugin, PluginSettingTab, Setting} from 'obsidian';
import * as CodeMirror from "codemirror";
import {Editor} from "codemirror";

interface MouseWheelZoomSettings {
    initialSize: number;
    keyCode: string;
    stepSize: number;
}

const DEFAULT_SETTINGS: MouseWheelZoomSettings = {
    keyCode: 'AltLeft',
    stepSize: 25,
    initialSize: 500
}

export default class MouseWheelZoomPlugin extends Plugin {
    settings: MouseWheelZoomSettings;
    editor: Editor
    isKeyHeldDown = false

    async onload() {
        await this.loadSettings();

        this.registerCodeMirror((cm: CodeMirror.Editor) => {
            this.editor = cm
        });

        this.registerDomEvent(document, "keydown", (evt: KeyboardEvent) => {
            if (evt.code === this.settings.keyCode) {
                this.isKeyHeldDown = true
                this.disableScroll()
            }
        })

        this.registerDomEvent(document, "keyup", (evt: KeyboardEvent) => {
            if (evt.code === this.settings.keyCode) {
                this.isKeyHeldDown = false
                this.enableScroll()
            }
        })

        this.registerDomEvent(document, "wheel", (evt: WheelEvent) => {
            if (this.isKeyHeldDown) {
                const eventTarget = evt.target as Element;
                if (eventTarget.nodeName === "IMG") {
                    this.handleZoom(evt, eventTarget);
                }
            }
        })

        this.addSettingTab(new SampleSettingTab(this.app, this));
    }

    /**
     * Handles zooming with the mousewheel on an image
     * @param evt wheel event
     * @param eventTarget targeted image element
     * @private
     */
    private handleZoom(evt: WheelEvent, eventTarget: Element) {
        const imageName = MouseWheelZoomPlugin.getImageNameFromUrl(eventTarget.attributes.getNamedItem("src").textContent);
        const activeFile = this.app.workspace.getActiveFile();

        this.app.vault.read(activeFile).then(async value => {
            const isInTable = MouseWheelZoomPlugin.isInTable(imageName,value)
            // Separator to use for the replacement
            const sizeSeparator = isInTable ? "\\|" : "|"
            // Separator to use for the regex: isInTable ? \\\| : \|
            const regexSeparator = isInTable ? "\\\\\\|" : "\\|"

            const sizeMatches = value.match(new RegExp(`${imageName}${regexSeparator}(\\d+)`))

            // Element already has a size entry
            if (sizeMatches !== null) {
                console.log("Size")
                const oldSize: number = parseInt(sizeMatches[1]);
                let newSize: number = oldSize;
                if (evt.deltaY < 0) {
                    newSize += this.settings.stepSize
                } else if (evt.deltaY > 0) {
                    newSize -= this.settings.stepSize
                }

                value = value.replace(`${imageName}${sizeSeparator}${oldSize}`, `${imageName}${sizeSeparator}${newSize}`)
            } else { // Element has no size entry -> give it an initial size
                const initialSize = this.settings.initialSize
                value = value.replace(`${imageName}`, `${imageName}${sizeSeparator}${initialSize}`)
            }

            // Save changed size
            await this.app.vault.modify(activeFile, value)
        })
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
        if (imageName.substr(0,2) === "2F") {
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

class SampleSettingTab extends PluginSettingTab {
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
            .setDesc('Key that needs to be pressed down for mousewheel zoom to work. Find the keycode by visiting' +
                ' https://keycode.info and copy the event.code')
            .addText(text => text
                .setPlaceholder('keycode')
                .setValue(this.plugin.settings.keyCode)
                .onChange(async (value) => {
                    this.plugin.settings.keyCode = value;
                    await this.plugin.saveSettings();
                }));

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
