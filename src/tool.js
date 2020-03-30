const Tool = {
  sleep: async duration => {
    await new Promise(function (resolve) {
      setTimeout(() => resolve(), duration);
    });
  },
  loss: percent => {
    const random = Math.random() * 100;
    const max = 100 - percent;
    if (random > max) {
      throw 'data loss';
    }
  }
};

module.exports = Tool;
