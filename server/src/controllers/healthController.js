const getHealth = (req, res) => {
  res.status(200).json({
    success: true,
    message: "Marketplace backend is running",
  });
};

export { getHealth };
