import { encode } from "querystring";


/**
 * ReplaceTerm enables us to store the parameters for a replacement to add a new size parameter.
 */
export class ReplaceTerm {
    replaceFrom: (oldSize: number) => string;
    replaceWith: (newSize: number) => string;

    constructor(replaceFrom: (oldSize: number) => string, replaceWith: (newSize: number) => string) {
        this.replaceFrom = replaceFrom;
        this.replaceWith = replaceWith;
    }

    // Generate a string that can be used in a string.replace() call as the string to replace
    public getReplaceFromString(oldSize: number): string {
        return this.replaceFrom(oldSize);
    }

    // Generate a string that can be used in a string.replace() call as the replacement string
    public getReplaceWithString(newSize: number): string {
        return this.replaceWith(newSize);
    }
}


export interface HandleZoomParams {
    // If the image already has a size parameter we use this regex to find it. The first group should be the current size.
    sizeMatchRegExp: RegExp;
    // Replacement terms for the case that the image already has a size parameter
    replaceSizeExist: ReplaceTerm;
    // Replacement terms for the case that the image does not have a size parameter yet
    replaceSizeNotExist: ReplaceTerm;
}


export class Util {
    /**
         * For a given file content decide if a string is inside a table
         * @param searchString string
         * @param fileValue file content
         * @private
         */
    public static isInTable(searchString: string, fileValue: string) {
        return fileValue.search(new RegExp(`^\\|.+${searchString}.+\\|$`, "m")) !== -1
    }


    /**
     * Get the image name from a given src uri of a local image
     * (URI like app://local/C:/.../image.png?1677337704730)
     * @param imageUri uri of the image
     * @private
     */
    public static getLocalImageNameFromUri(imageUri: string) {
        imageUri = decodeURI(imageUri);
        const imageNameMatch = imageUri.match(/([^/]+)\?/);
        const imageName = imageNameMatch ? imageNameMatch[1] : "";

        // Handle linux not correctly decoding the %2F before the Filename to a \
        const hasLinuxDecodingIssue = imageName.startsWith("2F");
        return hasLinuxDecodingIssue ? imageName.slice(2) : imageName;
    }


    /**
     * Get the parameters needed to handle the zoom for a local image.
     * Source can be either a obsidian link like [[image.png]] or a markdown link like [image.png](image.png)
     * @param imageName Name of the image
     * @param fileText content of the current file
     * @returns parameters to handle the zoom
     */
    public static getLocalImageZoomParams(imageName: string, fileText: string): HandleZoomParams {
        imageName = this.determineImageName(imageName, fileText);

        // Get the folder name if the image is located in a folder
        const folderName = this.getFolderNameIfExist(imageName, fileText);
        imageName = `${folderName}${imageName}`;


        const isInTable = Util.isInTable(imageName, fileText)
        // Separator to use for the replacement
        const sizeSeparator = isInTable ? "\\|" : "|"
        // Separator to use for the regex: isInTable ? \\\| : \|
        const regexSeparator = isInTable ? "\\\\\\|" : "\\|"



        const imageAttributes = this.getImageAttributes(imageName, fileText);
        imageName = `${imageName}${imageAttributes}`;

        // check character before the imageName to check if markdown link or obsidian link
        const imageNamePosition = fileText.indexOf(imageName);
        const isObsidianLink = fileText.charAt(imageNamePosition - 1) === "["

        if (isObsidianLink) {
            return Util.generateReplaceTermForObsidianSyntax(imageName, regexSeparator, sizeSeparator);
        } else {
            return Util.generateReplaceTermForMarkdownSyntax(imageName, regexSeparator, sizeSeparator, fileText);
        }
    }

    /**
     * When using markdown link syntax the image name can be encoded. This function checks if the image name is encoded and if not encodes it.
     * 
     * @param origImageName Image name
     * @param fileText File content
     * @returns image name with the correct encoding
     */
    private static determineImageName(origImageName: string, fileText: string): string {
        const encodedImageName = encodeURI(origImageName);
        const spaceEncodedImageName = origImageName.replace(/ /g, "%20");

        // Try matching original, full URI encoded, and space encoded
        const imageNameVariants = [origImageName, encodedImageName, spaceEncodedImageName];

        for (const variant of imageNameVariants) {
            if (fileText.includes(variant)) {
                return variant;
            }
        }

        throw new Error("Image not found in file");
    }


    /**
    * Extracts the folder name from the given image name by looking for the first "[" or "(" character
    * that appears before the image name in the file text.
    * @param imageName The name of the image.
    * @param fileText The text of the file that contains the image.    
    * @returns The name of the folder that contains the image, or an empty string if no folder is found.
    */
    private static getFolderNameIfExist(imageName: string, fileText: string): string {
        const index = fileText.indexOf(imageName);

        if (index === -1) {
            throw new Error("Image not found in file");
        }

        const stringBeforeFileName = fileText.substring(0, index);

        const lastOpeningBracket = stringBeforeFileName.lastIndexOf("["); // Obsidian link
        const lastOpeningParenthesis = stringBeforeFileName.lastIndexOf("("); // Markdown link
        const lastOpeningBracketOrParenthesis = Math.max(lastOpeningBracket, lastOpeningParenthesis);
        const folderName = stringBeforeFileName.substring(lastOpeningBracketOrParenthesis + 1);

        return folderName;
    }

    /**
* Extracts any image attributes like |ctr for ITS Theme that appear after the given image name in the file.    
* @param imageName - The name of the image to search for.
* @param fileText - The content of the file to search in.
* @returns A string containing any image attributes that appear after the image name.
*/
    private static getImageAttributes(imageName: string, fileText: string): string {
        const index = fileText.indexOf(imageName);
        const stringAfterFileName = fileText.substring(index + imageName.length);
        const regExpMatchArray = stringAfterFileName.match(/([^\]]*?)\\?\|\d+]]|([^\]]*?)]]|/);

        if (regExpMatchArray) {
            if (!!regExpMatchArray[1]) {
                return regExpMatchArray[1];
            } else if (!!regExpMatchArray[2]) {
                return regExpMatchArray[2];
            }
        }

        return "";
    }

    /**
     * Get the parameters needed to handle the zoom for images in markdown format.
     * Example: ![image.png](image.png)
     * @param imageName Name of the image
     * @param fileText content of the current file
     * @returns parameters to handle the zoom
     * @private
     * 
     */
    private static generateReplaceTermForMarkdownSyntax(imageName: string, regexSeparator: string, sizeSeparator: string, fileText: string): HandleZoomParams {

        const sizeMatchRegExp = new RegExp(`${regexSeparator}(\\d+)]${escapeRegex("(" + imageName + ")")}`);

        const replaceSizeExistFrom = (oldSize: number) => `${sizeSeparator}${oldSize}](${imageName})`;
        const replaceSizeExistWith = (newSize: number) => `${sizeSeparator}${newSize}](${imageName})`;

        const replaceSizeNotExistsFrom = (oldSize: number) => `](${imageName})`;
        const replaceSizeNotExistsWith = (newSize: number) => `${sizeSeparator}${newSize}](${imageName})`;

        const replaceSizeExist = new ReplaceTerm(replaceSizeExistFrom, replaceSizeExistWith);
        const replaceSizeNotExist = new ReplaceTerm(replaceSizeNotExistsFrom, replaceSizeNotExistsWith);

        return {
            sizeMatchRegExp: sizeMatchRegExp,
            replaceSizeExist: replaceSizeExist,
            replaceSizeNotExist: replaceSizeNotExist,
        };
    }

    /**
     * Get the parameters needed to handle the zoom for images in markdown format.
     * Example: ![[image.png]]
     * @param imageName Name of the image
     * @param fileText content of the current file
     * @returns parameters to handle the zoom
     * @private
     * 
     */
    private static generateReplaceTermForObsidianSyntax(imageName: string, regexSeparator: string, sizeSeparator: string) {
        const sizeMatchRegExp = new RegExp(`${escapeRegex(imageName)}${regexSeparator}(\\d+)`);

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
        };
    }

    /**
     * Get the parameters needed to handle the zoom for a remote image.
     * Format: https://www.example.com/image.png
     * @param imageUri URI of the image
     * @param fileText content of the current file
     * @returns parameters to handle the zoom
     */
    public static getRemoteImageZoomParams(imageUri: string, fileText: string): HandleZoomParams {
        const isInTable = Util.isInTable(imageUri, fileText)
        // Separator to use for the replacement
        const sizeSeparator = isInTable ? "\\|" : "|"
        // Separator to use for the regex: isInTable ? \\\| : \|
        const regexSeparator = isInTable ? "\\\\\\|" : "\\|"

        return Util.generateReplaceTermForMarkdownSyntax(imageUri, regexSeparator, sizeSeparator, fileText);
    }

}


export default Util;

/**
 * Function to escape a string into a valid searchable string for a regex
 * @param string string to escape
 * @returns escaped string
 */
export function escapeRegex(string: string): string {
    return string.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
}
