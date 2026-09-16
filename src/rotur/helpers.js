// Block utilities for creating blocks with less code
const blocks = {
  reporter: function (opcode, text, args = {}, options = {}) {
    return {
      opcode,
      blockType: Scratch.BlockType.REPORTER,
      text,
      arguments: args,
      ...options
    };
  },

  command: function (opcode, text, args = {}, options = {}) {
    return {
      opcode,
      blockType: Scratch.BlockType.COMMAND,
      text,
      arguments: args,
      ...options
    };
  },

  boolean: function (opcode, text, args = {}, options = {}) {
    return {
      opcode,
      blockType: Scratch.BlockType.BOOLEAN,
      text,
      arguments: args,
      ...options
    };
  },

  event: function (opcode, text, options = {}) {
    return {
      opcode,
      blockType: Scratch.BlockType.EVENT,
      text,
      isEdgeActivated: false,
      ...options
    };
  },

  button: function (text, func, options = {}) {
    return {
      blockType: Scratch.BlockType.BUTTON,
      text,
      func,
      ...options
    };
  },

  label: function (text) {
    return {
      blockType: Scratch.BlockType.LABEL,
      text
    };
  },

  separator: function () {
    return "---";
  }
};

const randomString = function (length) {
  var result = "";
  var characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  var charactersLength = characters.length;
  for (var i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
};

export { blocks, randomString };
