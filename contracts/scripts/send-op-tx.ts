import { network } from 'hardhat'

const { ethers } = await network.connect()

async function main() {
  console.log('Using network specified in CLI (e.g. Sepolia)')

  // Получаем подписанта (signer) из твоего .env (SEPOLIA_PRIVATE_KEY)
  const [sender] = await ethers.getSigners()

  console.log('Sender address:', sender.address)
  // Проверка: здесь должен быть ТВОЙ адрес кошелька, а не 0xf39Fd...

  console.log('Sending 1 wei from', sender.address, 'to itself')

  // Отправляем транзакцию
  const tx = await sender.sendTransaction({
    to: '0x86A5A05aC0cAb580d3f0082A70E3f65281aABAf0',
    value: 1n, // 1 wei
  })

  console.log('Transaction hash:', tx.hash)

  // Ждем подтверждения
  await tx.wait()

  console.log('Transaction confirmed!')
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
