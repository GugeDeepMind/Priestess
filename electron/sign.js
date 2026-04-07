// Skip code signing for open-source builds
exports.default = async function(configuration) {
  // No-op: skip signing
  console.log('Skipping code signing (open-source build)')
}
