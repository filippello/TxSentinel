import { useAutoAnimate } from "@formkit/auto-animate/react"
import { BrowserProvider } from "ethers"
import { useEffect } from "react"
import { FaEthereum, FaWallet } from "react-icons/fa6"
import { ToastContainer } from 'react-toastify'
import 'react-toastify/dist/ReactToastify.css'
import { twMerge } from "tailwind-merge"
import { useAsynchronism } from "./functional/asynchronism"
import { IO, Maybe, none, pipe, Unit } from "./functional/functional"
import { List } from "./functional/list"
import { useIOValue, useStatefull } from "./functional/state"
import { ServerMessage } from "./model"
import { notificationShow } from "./notification"
import { AppAction, AppState } from "./state"
import { Col, Row } from "./ui/kit/Col"
import { showIf } from "./util"
import { websocketConnection } from "./websocket"
import { browserProvider, ethereum, toastShow, websocketUrl } from "./window"
import { InitialView } from "./ui/InitialView"
import { EmptyView } from "./ui/EmptyView"
import { TxWarningsView } from "./ui/TxWarningsView"



export const App = () => {

  const providerState = useIOValue<Maybe<BrowserProvider>>(browserProvider)

  return <>
    {
      providerState === none ? <NoProviderView/> :
      <AppWithProvider 
        provider={providerState}
      />
    }
    <ToastContainer />
  </>
}

export const AppWithProvider = (
  props: {
    provider: BrowserProvider
  }
) => {

  const {
    warnings,
    balanceEth,
    walletAddress,
    action,
    connect,
    connection
  } = useFeatures(props.provider)

  const [parent] = useAutoAnimate()

  const warningsByTx = pipe(warnings)(
    List.groupByString(it => it.txHash),
    it => Object.entries(it)
  )

  console.log(warningsByTx)

  return (
    <Col
      className="items-stretch justify-start h-screen"
    >

      <Header
        balanceEth={balanceEth}
        walletAddress={walletAddress}
      />

      {
        connection === none ? (
          <InitialView
            className="grow"
            loading={connect.type == "running"}
            onConnect={connect.run({})}
          />
        ) : (
        <Col
          ref={parent}
          className="flex-wrap gap-4 p-4 justify-start items-start grow"
        >

          {
            showIf(warnings.length === 0)(
              <EmptyView
                className="grow"
		            wallet={walletAddress}
              />
            )
          }

          {
            warningsByTx.map(([txHash, warnings]) =>
              <TxWarningsView
                key={txHash}
                txHash={txHash}
                warnings={warnings}
                onTxSend={
                  connection?.send({
                    type: "TxAllow",
                    txHash: txHash
                  })
                }
                onWarningIgnore={warningHash =>
                  action({
                    type: "IgnoreWarning",
                    warningHash: warningHash
                  })
                }
                onWarningCancel={warninghash => 
                  connection?.send({
                    type: "TxWarningAccept",
                    warningHash: warninghash
                  })
                }
              />
            )
          }
        </Col>
        )
      }

    </Col>
  )
}



const Header = (
  props: {
    balanceEth: Maybe<number>
    walletAddress: Maybe<string>
  }
) => {

  return <Row
    className="p-4 items-center justify-between border-b border-gray-200 bg-white"
  >
    
    <Col className="w-0 grow items-start">
    
      <Row
        className="items-center justify-center gap-2"
      >

        <img
          src="/avalanche.svg"
          className="h-10 w-10"
        />

        <div className="text-2xl font-bold">
          TxSentinel
        </div>

      </Row>

    </Col>


    <Col className="w-0 grow items-center">
      {
        props.balanceEth === none ? none :
        <Row className="items-center gap-2 font-bold">
          TxSentinel balance:
          <Row
          className="font-mono text-gray-500 text-sm p-2 bg-gray-200 rounded-md items-center gap-2"
        >
          <FaEthereum/>
          {props.balanceEth.toFixed(10)}
        </Row>
        </Row>
        
      }
    </Col>

    <Col className="w-0 grow items-end">
      {
        props.walletAddress === none ? none :
        <Row
          className="font-mono text-gray-500 text-sm p-2 bg-gray-200 rounded-md items-center gap-2"
        >
          <FaWallet/>
          {props.walletAddress}
        </Row>
      }
    </Col>

  </Row>
}




export const NoProviderView = (
  props: {
    className?: string
  }
) => {

  return <Col 
    className={
      twMerge(
        "p-4 items-center justify-center gap-4",
        props.className
      )
    }
  >
    <div className="text-2xl font-bold">
      No Web3 Wallet detected...
    </div>
    <div className="text-gray-500">
      Install a Web3 wallet to use this DApp
    </div>
  </Col>
}


const useFeatures = (provider: BrowserProvider) => {

  const state = useStatefull<AppState>(() => AppState.initial)

  const action = (action: AppAction) => state.update(AppState.reducer(action))

  const connect = useAsynchronism(
    () =>
      trackingStart(provider)({
        onMessage: 
          message => 
            () => {
              action({
                type: "ServerMessage",
                message: message
              })()
              if (message.type === "TxWarning") {
                notificationShow({
                  message: "TxSentinel Warning! Click to see details"
                })()
              }
            },
          onClose: reason =>
            () => {
              connect.reset()
              state.update(() => AppState.initial)()
              toastShow("error")(`Connection with TxSentinel lost: ${reason}`)()
              if(!document.hasFocus()) { 
                notificationShow({
                  message: "TxSentinel Disconnected! Click to reconnect"
                })()
              }
            }
      }),
    {
      onError: state => toastShow("error")(`Error: ${state.error}`)
    }
  )

  const connection = connect.output?.connection

  useEffect(
    connection === none ? IO.noOp :  
    () => {
      return connection?.close
    }, 
    [connect.type]
  )

  return {
    warnings: state.value.warnings,
    balanceEth: state.value.balanceEth,
    walletAddress: connect.output?.wallet,
    action: action,
    connect,
    connection: connection
  }
}


/*

// Comprueba si MetaMask está instalada
if (typeof window.ethereum !== 'undefined') {
    console.log('MetaMask está instalada!');

    // Configura el RPC automáticamente
    async function addNetwork() {
        try {
            // Solicitar a MetaMask que agregue una nueva red
            await window.ethereum.request({
                method: 'wallet_addEthereumChain',
                params: [{
                    chainId: '0x43117', // Cambia esto por el chainId de la red que desees agregar (ej. 0x1 para Ethereum Mainnet)
                    chainName: 'TxSentinel RPC etna C-Chain', // Nombre de la red
                    nativeCurrency: {
                        name: 'AVAX', // Nombre de la moneda nativa
                        symbol: 'AVAX', // Símbolo de la moneda nativa
                        decimals: 18, // Decimales de la moneda
                    },
                    rpcUrls: ['localhost:8080'], // URL del nodo RPC
                    blockExplorerUrls: ['https://etherscan.io'], // URL del explorador de bloques
                }],
            });
            console.log('Red agregada correctamente');
        } catch (error) {
            console.error('Error al agregar la red:', error);
        }
    }

    addNetwork();
} else {
    console.log('Por favor, instala MetaMask para continuar.');
}

*/


const trackingStart =
  (provider: BrowserProvider) => 
  (
    args: {
      onMessage: (message: ServerMessage) => IO<Unit>
      onClose: (reason: string) => IO<Unit>
    }
  ) =>
  async () => {

    const signer = await provider.getSigner()

    await ethereumChainAdd({
      chainId: "0x43117",
      chainName: "TxSentinel RPC etna C-Chain",
      nativeCurrency: {
        name: "AVAX",
        symbol: "AVAX",
        decimals: 18,
      },
      rpcUrls: ["http://localhost:8080"],
      blockExplorerUrls: ["https://snowtrace.io/"],
    })()


    const permission = await Notification.requestPermission()
    if (permission !== "granted") throw "Notifications permission denied"

    const connection = await websocketConnection({
      url: websocketUrl,
      onMessage: args.onMessage,
      onClose: event => 
          args.onClose(event.reason === "" ? "Connection error" : event.reason)
    })()

    connection.send({
      type: "WalletTrack",
      address: signer.address
    })()

    return {
      wallet: signer.address,
      connection: connection
    }
  }



const ethereumChainAdd = 
  (
    args: {
      chainId: string
      chainName: string
      nativeCurrency: {
        name: string
        symbol: string
        decimals: number
      }
      rpcUrls: List<string>
      blockExplorerUrls: List<string>
    }
  ) => 
  async () => {

    if (ethereum == none) return

    try {

      await ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [args],
      })

    } catch (e) {
      console.error(e)
    }

  }
