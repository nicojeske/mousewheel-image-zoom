

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
        const isInTable = Util.isInTable(imageName, fileText)
        // Separator to use for the replacement
        const sizeSeparator = isInTable ? "\\|" : "|"
        // Separator to use for the regex: isInTable ? \\\| : \|
        const regexSeparator = isInTable ? "\\\\\\|" : "\\|"


        const imageNamePosition = fileText.indexOf(imageName);
        const stringAfterFileName = fileText.substring(imageNamePosition + imageName.length)

        // Handle the case where behind the imageName there are more attributes like |ctr for ITS Theme by attaching them to the imageName
        const regExpMatchArray = stringAfterFileName.match(/([^\]]*?)\\?\|\d+]]|([^\]]*?)]]|/);
        if (regExpMatchArray) {
            if (!!regExpMatchArray[1]) {
                imageName += regExpMatchArray[1]
            } else if (!!regExpMatchArray[2]) {
                imageName += regExpMatchArray[2]
            }
        }


        // check character before the imageName to check if markdown link or obsidian link
        const isObsidianLink = fileText.charAt(imageNamePosition - 1) === "["

        if (isObsidianLink) {
            return Util.generateReplaceTermForObsidianSyntax(imageName, regexSeparator, sizeSeparator);
        } else {
            return Util.generateReplaceTermForMarkdownSyntax(imageName, regexSeparator, sizeSeparator, fileText);
        }
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
    private static generateReplaceTermForMarkdownSyntax(imageName: string, regexSeparator: string, sizeSeparator: string, fileText: string): HandleZoomParams  {
        // Encodes the imageName to handle special characters like spaces
        imageName = encodeURI(imageName)
        
        // For local images the image can be located in a folder. In this case we need to add the folder name to the imageName
        // We get the folder name from the string before the imageName up to the frist )
        const imageNamePosition = fileText.indexOf(imageName);
        const stringBeforeFileName = fileText.substring(0, imageNamePosition)
        const lastOpeningBracket = stringBeforeFileName.lastIndexOf("(")
        const folderName = stringBeforeFileName.substring(lastOpeningBracket + 1, imageNamePosition)
        imageName = folderName + imageName
        

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
