module.exports = {
  getApiName: (originalUrl) => {
    // Tách chuỗi bằng dấu //
    const parts = originalUrl.split("/");
    if (parts[0] == "") {
      const result = parts[1];
      return result;
    }
    return null;
  },
};
