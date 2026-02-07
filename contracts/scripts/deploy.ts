import hre from 'hardhat'

async function main() {
  const { ethers } = await hre.network.connect()

  console.log('Deploying Mafia Game contracts...')

  const MafiaToken = await ethers.getContractFactory('MafiaToken')
  const token = await MafiaToken.deploy()
  await token.waitForDeployment()
  const tokenAddress = await token.getAddress()
  console.log('✅ MafiaToken deployed to:', tokenAddress)

  const MafiaGame = await ethers.getContractFactory('MafiaGame')
  const game = await MafiaGame.deploy(tokenAddress)
  await game.waitForDeployment()
  const gameAddress = await game.getAddress()
  console.log('✅ MafiaGame deployed to:', gameAddress)

  console.log('Transferring token ownership to game contract...')
  const tx = await token.transferOwnership(gameAddress)
  await tx.wait()
  console.log('✅ Ownership transferred')

  console.log('\n=== Deployment Summary ===')
  console.log('MafiaToken:', tokenAddress)
  console.log('MafiaGame:', gameAddress)
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
