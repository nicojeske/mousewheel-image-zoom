import {App, MarkdownView, Plugin, PluginSettingTab, Setting, TFile, WorkspaceWindow, View} from 'obsidian';
import { Util, HandleZoomParams } from  "./src/util";
 

interface MouseWheelZoomSettings {
    initialSize: number;
    modifierKey: ModifierKey;
    stepSize: number;
    resizeInCanvas: boolean;
}

enum ModifierKey {
    ALT = "AltLeft",
    CTRL = "ControlLeft",
    SHIFT = "ShiftLeft",
    ALT_RIGHT = "AltRight",
    CTRL_RIGHT = "ControlRight",
    SHIFT_RIGHT = "ShiftRight"
}

const DEFAULT_SETTINGS: MouseWheelZoomSettings = {
    modifierKey: ModifierKey.ALT,
    stepSize: 25,
    initialSize: 500,
    resizeInCanvas: false,
}

export default class MouseWheelZoomPlugin extends Plugin {
    settings: MouseWheelZoomSettings;
    isKeyHeldDown = false;

    async onload() {
        await this.loadSettings();
        this.registerEvent(
            this.app.workspace.on("window-open", (newWindow: WorkspaceWindow) => this.registerEvents(newWindow.win))
        );
        this.registerEvents(window);

        this.addSettingTab(new MouseWheelZoomSettingsTab(this.app, this));

        console.log("Loaded: Mousewheel image zoom")
    }

    /**
     * When the config key is released, we enable the scroll again and reset the key held down flag.
     */
    onConfigKeyUp(currentWindow: Window) {
        this.isKeyHeldDown = false;
        this.enableScroll(currentWindow);
    }

    onunload(currentWindow: Window = window) {
        // Re-enable the normal scrolling behavior when the plugin unloads
        this.enableScroll(currentWindow);
    }

     /**
     * Registers image resizing events for the specified window
     * @param currentWindow window in which to register events
     * @private
     */
    private registerEvents(currentWindow: Window) {
        const doc: Document = currentWindow.document;
        this.registerDomEvent(doc, "keydown", (evt) => {
            if (evt.code === this.settings.modifierKey.toString()) {
                this.isKeyHeldDown = true;

                if (this.settings.modifierKey !== ModifierKey.SHIFT && this.settings.modifierKey !== ModifierKey.SHIFT_RIGHT) { // Ignore shift to allow horizontal scrolling
                    // Disable the normal scrolling behavior when the key is held down
                    this.disableScroll(currentWindow);
                }
            }
        });
        this.registerDomEvent(doc, "keyup", (evt) => {
            if (evt.code === this.settings.modifierKey.toString()) {
                this.onConfigKeyUp(currentWindow);
            }
        });
        this.registerDomEvent(doc, "wheel", (evt) => {
            if (this.isKeyHeldDown) {
                // When for example using Alt + Tab to switch between windows, the key is still recognized as held down.
                // We check if the key is really held down by checking if the key is still pressed in the event when the
                // wheel event is triggered.
                if (!this.isConfiguredKeyDown(evt)) {
                    this.onConfigKeyUp(currentWindow);
                    return;
                }

                const eventTarget = evt.target as Element;
                
                const targetIsCanvas: boolean = eventTarget.hasClass("canvas-node-content-blocker")
                const targetIsCanvasNode: boolean = eventTarget.closest(".canvas-node-content") !== null;
                const targetIsImage: boolean = eventTarget.nodeName === "IMG";

                if (targetIsCanvas || targetIsCanvasNode || targetIsImage) {
                    this.disableScroll(currentWindow);
                }

                if (targetIsCanvas && this.settings.resizeInCanvas){                  
                    // seems we're trying to zoom on some canvas node.                    
                    this.handleZoomForCanvas(evt, eventTarget);
                } 
                else if (targetIsCanvasNode) {
                    // we trying to resize focused canvas node.
                    // i think here can be implementation of zoom images in embded markdown files on canvas. 
                }
                else if (targetIsImage) {
                    // Handle the zooming of the image
                    this.handleZoom(evt, eventTarget);
                }
            }
        });
    }

     /**
     * Handles zooming with the mousewheel on canvas node 
     * @param evt wheel event
     * @param eventTarget targeted canvas node element
     * @private
     */
    handleZoomForCanvas(evt: WheelEvent, eventTarget: Element) {
        // get active canvas
        const isCanvas: boolean = this.app.workspace.getActiveViewOfType(View).getViewType() === "canvas";
        if (!isCanvas) {
            throw new Error("Can't find canvas");
        };
        // Unfortunately the current type definitions don't include any canvas functionality...
        const canvas = (this.app.workspace.getActiveViewOfType(View) as any).canvas;
        
        // get triggered canvasNode
        const canvasNode = 
            Array.from(canvas.nodes.values())
            .find(node => (node as any).contentBlockerEl == eventTarget) as any;
                
        // Adjust delta based on the direction of the resize
        let delta = evt.deltaY > 0 ? this.settings.stepSize : this.settings.stepSize * -1;

        // Calculate new dimensions directly using the delta and aspectRatio
        const aspectRatio = canvasNode.width / canvasNode.height;
        const newWidth = canvasNode.width + delta;
        const newHeight = newWidth / aspectRatio;

        // Resize the canvas node using the new dimensions
        canvasNode.resize({width: newWidth, height: newHeight});
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

        // Get parameters like the regex or the replacement terms based on the fact if the image is locally stored or not.
        const zoomParams: HandleZoomParams = this.getZoomParams(imageUri, fileText, eventTarget);

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
            var image = new Image();
            image.src = imageUri;
            var width = image.naturalWidth;
            var minWidth = Math.min(width, initialSize);
            fileText = fileText.replace(zoomParams.replaceSizeNotExist.getReplaceFromString(0), zoomParams.replaceSizeNotExist.getReplaceWithString(minWidth));
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


    private getZoomParams(imageUri: string, fileText: string, target: Element) {
       if (imageUri.contains("http")) {
           return Util.getRemoteImageZoomParams(imageUri, fileText)
       } else if (target.classList.value.match("excalidraw-svg.*")) {
           const src = target.attributes.getNamedItem("filesource").textContent;
           // remove ".md" from the end of the src
           const imageName = src.substring(0, src.length - 3);
           // Only get text after "/"
           const imageNameAfterSlash = imageName.substring(imageName.lastIndexOf("/") + 1);
           return Util.getLocalImageZoomParams(imageNameAfterSlash, fileText)
       } else if (imageUri.contains("app://")) {
           const imageName = Util.getLocalImageNameFromUri(imageUri);
           return Util.getLocalImageZoomParams(imageName, fileText)
       }

       throw new Error("Image is not zoomable")
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    // Utilities to disable and enable scrolling //


    preventDefault(ev: WheelEvent) {
        ev.preventDefault();
    }

    wheelOpt: AddEventListenerOptions = {passive: false, capture: true }
    wheelEvent = 'wheel' as keyof WindowEventMap;

    /**
     * Disables the normal scroll event
     */
    disableScroll(currentWindow: Window) {
        currentWindow.addEventListener(this.wheelEvent, this.preventDefault, this.wheelOpt);
    }
 
    /**
     * Enables the normal scroll event
     */
    enableScroll(currentWindow: Window) {
        currentWindow.removeEventListener(this.wheelEvent, this.preventDefault, this.wheelOpt);
    }

    private isConfiguredKeyDown(evt: WheelEvent): boolean {
        switch (this.settings.modifierKey) {
            case ModifierKey.ALT:
            case ModifierKey.ALT_RIGHT:
                return evt.altKey;
            case ModifierKey.CTRL:
            case ModifierKey.CTRL_RIGHT:
                return evt.ctrlKey;
            case ModifierKey.SHIFT:
            case ModifierKey.SHIFT_RIGHT:
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
                .addOption(ModifierKey.CTRL_RIGHT, "Right Ctrl")
                .addOption(ModifierKey.ALT_RIGHT, "Right Alt")
                .addOption(ModifierKey.SHIFT_RIGHT, "Right Shift")
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
                    .setValue(this.plugin.settings.initialSize)
                    .onChange(async (value) => {
                        this.plugin.settings.initialSize = value
                        await this.plugin.saveSettings()
                    })
            })

        new Setting(containerEl)
            .setName('Resize in canvas')
            .setDesc('When enabled, all nodes on the Obsidian canvas can also be resized using the Modifier key')
            .addToggle((toggle) => {
				toggle.setValue(this.plugin.settings.resizeInCanvas)
					.onChange(async (value) => {
						this.plugin.settings.resizeInCanvas = value;
						await this.plugin.saveSettings();
					});
			});
    }
}




