const apiResponse = (data, message = "Request successful.") => {
  return {
    success: true,
    message,
    data,
  };
};

export { apiResponse };
