import Util from '../src/util';

describe('Util', () => {
  describe('isInTable', () => {
    it('should return true when search string is present in table', () => {
      const searchString = 'apple';
      const fileValue = '| fruit | quantity |\n|-------|----------|\n| apple | 10       |\n| orange | 5        |';
      expect(Util.isInTable(searchString, fileValue)).toBe(true);
    });

    it('should return false when search string is not present in table', () => {
      const searchString = 'banana';
      const fileValue = '| fruit | quantity |\n|-------|----------|\n| apple | 10       |\n| orange | 5        |';
      expect(Util.isInTable(searchString, fileValue)).toBe(false);
    });

    it('should return true when search string is present in a multi-line table', () => {
      const searchString = 'orange';
      const fileValue = '| fruit | quantity |\n|-------|----------|\n| apple | 10       |\n| orange | 5        |\n| pear  | 8        |';
      expect(Util.isInTable(searchString, fileValue)).toBe(true);
    });

    it('should return false when search string is not in table but is in a different part of the file', () => {
      const searchString = 'apple';
      const fileValue = 'This is a file with an apple in it, but not in a table';
      expect(Util.isInTable(searchString, fileValue)).toBe(false);
    });

    it('should be case-sensitive', () => {
      const searchString = 'apple';
      const fileValue = '| Fruit | Quantity |\n|-------|----------|\n| Apple | 10       |\n| Orange | 5        |';
      expect(Util.isInTable(searchString, fileValue)).toBe(false);
    });
  });

  describe('getLocalImageNameFromUri', () => {
    test('returns empty string for invalid URI', () => {
      expect(Util.getLocalImageNameFromUri('invalid-uri')).toBe('');
    });

    test('handles URI with query string', () => {
      const imageName = 'image.png';
      const timestamp = new Date().getTime();
      const uri = `app://local/C:/path/to/${imageName}?${timestamp}`;
      expect(Util.getLocalImageNameFromUri(uri)).toBe(imageName);
    });

    test('handles URI with linux decoding issue', () => {
      const imageName = 'image.png';
      const uri = `app://local/C:/path/to/2F${imageName}?12345`;
      expect(Util.getLocalImageNameFromUri(uri)).toBe(imageName);
    });

    test('handles URI with encoded spaces', () => {
      const imageName = 'image file.png';
      const encodedImageName = encodeURIComponent(imageName);
      const uri = `app://local/C:/path/to/${encodedImageName}?67890`;
      expect(Util.getLocalImageNameFromUri(uri)).toBe(imageName);
    });

    test('handles jpeg image', () => {
      const imageName = 'B466995A-B97F-4DE2-B036-0684F84B374B.jpeg';
      const uri = `app://local/C:/path/to/${imageName}?12345`;
      expect(Util.getLocalImageNameFromUri(uri)).toBe(imageName);
    });
  });

  describe("Util.getLocalImageZoomParams", () => {
    test("should return the correct regex and replace terms when the image is in a table no size", () => {
      const imageName = "example.png";
      const fileText = "| some | table | ![[example.png]] |";
      const result = Util.getLocalImageZoomParams(imageName, fileText);

      expect(result.sizeMatchRegExp).toEqual(/example\.png\\\|(\d+)/);
      expect(fileText.match(result.sizeMatchRegExp)).toEqual(null);
      expect(result.replaceSizeNotExist.getReplaceFromString(100)).toEqual("example.png");
      expect(result.replaceSizeNotExist.getReplaceWithString(200)).toEqual("example.png\\|200");

      const newFileText = fileText.replace(result.replaceSizeNotExist.getReplaceFromString(100), result.replaceSizeNotExist.getReplaceWithString(200));
      expect(newFileText).toEqual("| some | table | ![[example.png\\|200]] |");
    });

    test("should return the correct regex and replace terms when the image is not in a table no size", () => {
      const imageName = "example.png";
      const fileText = "Lorem ipsum ![[example.png]] dolor sit amet";
      const result = Util.getLocalImageZoomParams(imageName, fileText);

      expect(result.sizeMatchRegExp).toEqual(/example\.png\|(\d+)/);
      expect(fileText.match(result.sizeMatchRegExp)).toEqual(null);
      expect(result.replaceSizeNotExist.getReplaceFromString(100)).toEqual("example.png");
      expect(result.replaceSizeNotExist.getReplaceWithString(200)).toEqual("example.png|200");

      const newFileText = fileText.replace(result.replaceSizeNotExist.getReplaceFromString(100), result.replaceSizeNotExist.getReplaceWithString(200));
      expect(newFileText).toEqual("Lorem ipsum ![[example.png|200]] dolor sit amet");
    });

    test("should handle imageName with additional attributes correctly when not in table no size", () => {
      const imageName = "example.png|ctr";
      const fileText = "Lorem ipsum ![[example.png|ctr]] dolor sit amet";
      const result = Util.getLocalImageZoomParams(imageName, fileText);

      expect(result.sizeMatchRegExp).toEqual(/example\.png\|ctr\|(\d+)/);
      expect(fileText.match(result.sizeMatchRegExp)).toEqual(null);
      expect(result.replaceSizeNotExist.getReplaceFromString(100)).toEqual("example.png|ctr");
      expect(result.replaceSizeNotExist.getReplaceWithString(200)).toEqual("example.png|ctr|200");

      const newFileText = fileText.replace(result.replaceSizeNotExist.getReplaceFromString(100), result.replaceSizeNotExist.getReplaceWithString(200));
      expect(newFileText).toEqual("Lorem ipsum ![[example.png|ctr|200]] dolor sit amet");
    });

    test("should handle imageName with additional attributes correctly when in table", () => {
      const imageName = "example.png";
      const fileText = "| some | table | ![[example.png\\|ctr]] |";
      const result = Util.getLocalImageZoomParams(imageName, fileText);

      expect(result.sizeMatchRegExp).toEqual(/example\.png\\\|ctr\\\|(\d+)/);
      expect(fileText.match(result.sizeMatchRegExp)).toEqual(null);
      expect(result.replaceSizeNotExist.getReplaceFromString(100)).toEqual("example.png\\|ctr");
      expect(result.replaceSizeNotExist.getReplaceWithString(200)).toEqual("example.png\\|ctr\\|200");

      const newFileText = fileText.replace(result.replaceSizeNotExist.getReplaceFromString(100), result.replaceSizeNotExist.getReplaceWithString(200));
      expect(newFileText).toEqual("| some | table | ![[example.png\\|ctr\\|200]] |");
    });

    test("should return the correct regex and replace terms when the image is in a table and has size parameter", () => {
      const imageName = "example.png";
      const fileText = "| some | table | ![[example.png\\|100]] |";
      const result = Util.getLocalImageZoomParams(imageName, fileText);

      expect(result.sizeMatchRegExp).toEqual(/example\.png\\\|(\d+)/);
      expect(fileText.match(result.sizeMatchRegExp)[1]).toEqual("100");
      expect(result.replaceSizeExist.getReplaceFromString(100)).toEqual("example.png\\|100");
      expect(result.replaceSizeExist.getReplaceWithString(200)).toEqual("example.png\\|200");

      const newFileText = fileText.replace(result.replaceSizeExist.getReplaceFromString(100), result.replaceSizeExist.getReplaceWithString(200));
      expect(newFileText).toEqual("| some | table | ![[example.png\\|200]] |");
    });

    test("should return the correct regex and replace terms when the image is not in a table and has size parameter", () => {
      const imageName = "example.png";
      const fileText = "Lorem ipsum ![[example.png|100]] dolor sit amet";
      const result = Util.getLocalImageZoomParams(imageName, fileText);

      expect(result.sizeMatchRegExp).toEqual(/example\.png\|(\d+)/);
      expect(fileText.match(result.sizeMatchRegExp)[1]).toEqual("100");
      expect(result.replaceSizeExist.getReplaceFromString(100)).toEqual("example.png|100");
      expect(result.replaceSizeExist.getReplaceWithString(200)).toEqual("example.png|200");

      const newFileText = fileText.replace(result.replaceSizeExist.getReplaceFromString(100), result.replaceSizeExist.getReplaceWithString(200));
      expect(newFileText).toEqual("Lorem ipsum ![[example.png|200]] dolor sit amet");
    });

    test('Handle local images in markdown format (no table, no size)', () => {
      const imageUri = 'example.png';
      const fileText = 'This is a test file with an image: ![](' + imageUri + ')';
      const result = Util.getLocalImageZoomParams(imageUri, fileText);

      expect(result.sizeMatchRegExp).toEqual( /\|(\d+)]\(example\.png\)/);
      expect(fileText.match(result.sizeMatchRegExp)).toEqual(null);
      expect(result.replaceSizeNotExist.getReplaceFromString(100)).toEqual("](example.png)");
      expect(result.replaceSizeNotExist.getReplaceWithString(200)).toEqual("|200](example.png)");

      const newFileText = fileText.replace(result.replaceSizeNotExist.getReplaceFromString(100), result.replaceSizeNotExist.getReplaceWithString(200));
      expect(newFileText).toEqual('This is a test file with an image: ![|200](example.png)');
    });

    test('Handle local images in markdown format (no table, with size)', () => {
      const imageUri = 'example.png';
      const fileText = 'This is a test file with an image: ![|100](example.png)';
      const result = Util.getLocalImageZoomParams(imageUri, fileText);

      expect(result.sizeMatchRegExp).toEqual( /\|(\d+)]\(example\.png\)/);
      expect(fileText.match(result.sizeMatchRegExp)[1]).toEqual("100");
      expect(result.replaceSizeExist.getReplaceFromString(100)).toEqual("|100](example.png)");
      expect(result.replaceSizeExist.getReplaceWithString(200)).toEqual("|200](example.png)");

      const newFileText = fileText.replace(result.replaceSizeExist.getReplaceFromString(100), result.replaceSizeExist.getReplaceWithString(200));
      expect(newFileText).toEqual('This is a test file with an image: ![|200](example.png)');
    });

    test('Handle local images in markdown format (in table, no size)', () => {
      const imageUri = 'example.png';
      const fileText = '| some | table | ![](example.png) |';
      const result = Util.getLocalImageZoomParams(imageUri, fileText);

      expect(result.sizeMatchRegExp).toEqual(/\\\|(\d+)]\(example\.png\)/);
      expect(fileText.match(result.sizeMatchRegExp)).toEqual(null);
      expect(result.replaceSizeNotExist.getReplaceFromString(100)).toEqual("](example.png)");
      expect(result.replaceSizeNotExist.getReplaceWithString(200)).toEqual("\\|200](example.png)");

      const newFileText = fileText.replace(result.replaceSizeNotExist.getReplaceFromString(100), result.replaceSizeNotExist.getReplaceWithString(200));
      expect(newFileText).toEqual('| some | table | ![\\|200](example.png) |');
    });

    test('Handle local images in markdown format with alt text', () => {
      const imageUri = 'example.png';
      const fileText = '| some | table | ![das](example.png) |';
      const result = Util.getLocalImageZoomParams(imageUri, fileText);

      expect(result.sizeMatchRegExp).toEqual(/\\\|(\d+)]\(example\.png\)/);
      expect(fileText.match(result.sizeMatchRegExp)).toEqual(null);
      expect(result.replaceSizeNotExist.getReplaceFromString(100)).toEqual("](example.png)");
      expect(result.replaceSizeNotExist.getReplaceWithString(200)).toEqual("\\|200](example.png)");

      const newFileText = fileText.replace(result.replaceSizeNotExist.getReplaceFromString(100), result.replaceSizeNotExist.getReplaceWithString(200));
      expect(newFileText).toEqual('| some | table | ![das\\|200](example.png) |');
    });

    test('Handle local images in markdown format (in table, with size)', () => {
      const imageUri = 'example.png';
      const fileText = '| some | table | ![\\|100](example.png) |';
      const result = Util.getLocalImageZoomParams(imageUri, fileText);

      expect(result.sizeMatchRegExp).toEqual(/\\\|(\d+)]\(example\.png\)/);
      expect(fileText.match(result.sizeMatchRegExp)[1]).toEqual("100");
      expect(result.replaceSizeExist.getReplaceFromString(100)).toEqual("\\|100](example.png)");
      expect(result.replaceSizeExist.getReplaceWithString(200)).toEqual("\\|200](example.png)");

      const newFileText = fileText.replace(result.replaceSizeExist.getReplaceFromString(100), result.replaceSizeExist.getReplaceWithString(200));
      expect(newFileText).toEqual('| some | table | ![\\|200](example.png) |');
    });



    test('Handle local images in markdown format in folder (no table, no size)', () => {
      const imageUri = 'example.png';
      const fileText = 'This is a test file with an image: ![](folder/' + imageUri + ')';
      const result = Util.getLocalImageZoomParams(imageUri, fileText);

      expect(result.sizeMatchRegExp).toEqual( /\|(\d+)]\(folder\/example\.png\)/);
      expect(fileText.match(result.sizeMatchRegExp)).toEqual(null);
      expect(result.replaceSizeNotExist.getReplaceFromString(100)).toEqual("](folder/example.png)");
      expect(result.replaceSizeNotExist.getReplaceWithString(200)).toEqual("|200](folder/example.png)");

      const newFileText = fileText.replace(result.replaceSizeNotExist.getReplaceFromString(100), result.replaceSizeNotExist.getReplaceWithString(200));
      expect(newFileText).toEqual('This is a test file with an image: ![|200](folder/example.png)');
    });

    test('Handle local images in markdown format in folder (no table, with size)', () => {
      const imageUri = 'example.png';
      const fileText = 'This is a test file with an image: ![|100](folder/' + imageUri + ')';
      const result = Util.getLocalImageZoomParams(imageUri, fileText);

      expect(result.sizeMatchRegExp).toEqual( /\|(\d+)]\(folder\/example\.png\)/);
      expect(fileText.match(result.sizeMatchRegExp)[1]).toEqual("100");
      expect(result.replaceSizeExist.getReplaceFromString(100)).toEqual("|100](folder/example.png)");
      expect(result.replaceSizeExist.getReplaceWithString(200)).toEqual("|200](folder/example.png)");

      const newFileText = fileText.replace(result.replaceSizeExist.getReplaceFromString(100), result.replaceSizeExist.getReplaceWithString(200));
      expect(newFileText).toEqual('This is a test file with an image: ![|200](folder/example.png)');
    });

    test('Handle local images in markdown format in folder (in table, no size)', () => {
      const imageUri = 'example.png';
      const fileText = '| some | table | ![](folder/' + imageUri + ') |';
      const result = Util.getLocalImageZoomParams(imageUri, fileText);

      expect(result.sizeMatchRegExp).toEqual( /\\\|(\d+)]\(folder\/example\.png\)/);
      expect(fileText.match(result.sizeMatchRegExp)).toEqual(null);
      expect(result.replaceSizeNotExist.getReplaceFromString(100)).toEqual("](folder/example.png)");
      expect(result.replaceSizeNotExist.getReplaceWithString(200)).toEqual("\\|200](folder/example.png)");

      const newFileText = fileText.replace(result.replaceSizeNotExist.getReplaceFromString(100), result.replaceSizeNotExist.getReplaceWithString(200));
      expect(newFileText).toEqual('| some | table | ![\\|200](folder/example.png) |');
    });

    test('Handle local images in markdown format in folder (in table, with size)', () => {
      const imageUri = 'example.png';
      const fileText = '| some | table | ![\\|100](folder/' + imageUri + ') |';
      const result = Util.getLocalImageZoomParams(imageUri, fileText);

      expect(result.sizeMatchRegExp).toEqual( /\\\|(\d+)]\(folder\/example\.png\)/);
      expect(fileText.match(result.sizeMatchRegExp)[1]).toEqual("100");
      expect(result.replaceSizeExist.getReplaceFromString(100)).toEqual("\\|100](folder/example.png)");
      expect(result.replaceSizeExist.getReplaceWithString(200)).toEqual("\\|200](folder/example.png)");

      const newFileText = fileText.replace(result.replaceSizeExist.getReplaceFromString(100), result.replaceSizeExist.getReplaceWithString(200));
      expect(newFileText).toEqual('| some | table | ![\\|200](folder/example.png) |');
    });



    test('Handle local images in markdown format in folder (no table, with size, encoded spaces)', () => {
      const imageUri = 'example picture.png';
      const fileText = 'This is a test file with an image: ![|100](folder/example%20picture.png)';
      const result = Util.getLocalImageZoomParams(imageUri, fileText);

      expect(result.sizeMatchRegExp).toEqual( /\|(\d+)]\(folder\/example%20picture\.png\)/);
      expect(fileText.match(result.sizeMatchRegExp)[1]).toEqual("100");
      expect(result.replaceSizeExist.getReplaceFromString(100)).toEqual("|100](folder/example%20picture.png)");
      expect(result.replaceSizeExist.getReplaceWithString(200)).toEqual("|200](folder/example%20picture.png)");

      const newFileText = fileText.replace(result.replaceSizeExist.getReplaceFromString(100), result.replaceSizeExist.getReplaceWithString(200));
      expect(newFileText).toEqual('This is a test file with an image: ![|200](folder/example%20picture.png)');
    });
  });

  describe('getRemoteImageZoomParams', () => {
    test('returns correct parameters for image not in table without size', () => {
      const imageUri = 'https://www.example.com/image.png';
      const fileText = 'This is a test file with an image: ![](' + imageUri + ')';
      const result = Util.getRemoteImageZoomParams(imageUri, fileText);

      expect(result.sizeMatchRegExp).toEqual(/\|(\d+)]\(https:\/\/www\.example\.com\/image\.png\)/);
      expect(fileText.match(result.sizeMatchRegExp)).toEqual(null);
      expect(result.replaceSizeNotExist.getReplaceFromString(100)).toEqual(`](${imageUri})`);
      expect(result.replaceSizeNotExist.getReplaceWithString(200)).toEqual(`|200](${imageUri})`);

      const newFileText = fileText.replace(result.replaceSizeNotExist.getReplaceFromString(0), result.replaceSizeNotExist.getReplaceWithString(200));
      expect(newFileText).toEqual(`This is a test file with an image: ![|200](${imageUri})`);
    });

    test('returns correct parameters for image in table without size', () => {
      const imageUri = 'https://www.example.com/image.png';
      const fileText = '| This | is | a | test | file | with | an | image | ![](' + imageUri + ') |';
      
      const result = Util.getRemoteImageZoomParams(imageUri, fileText);

      expect(result.sizeMatchRegExp).toEqual(/\\\|(\d+)]\(https:\/\/www\.example\.com\/image\.png\)/);
      expect(fileText.match(result.sizeMatchRegExp)).toEqual(null);
      expect(result.replaceSizeNotExist.getReplaceFromString(100)).toEqual("](https://www.example.com/image.png)");
      expect(result.replaceSizeNotExist.getReplaceWithString(200)).toEqual("\\|200](https://www.example.com/image.png)");

      const newFileText = fileText.replace(result.replaceSizeNotExist.getReplaceFromString(0), result.replaceSizeNotExist.getReplaceWithString(200));
      expect(newFileText).toEqual(`| This | is | a | test | file | with | an | image | ![\\|200](${imageUri}) |`);
    });

    
  });




});
