import { useEffect, useState } from 'react'

import * as Webnative from 'webnative'
import * as WebnativeFilecoin from 'webnative-filecoin';

import * as C from '@common/constants';
import * as R from '@common/requests';

import Cookies from 'js-cookie';
import { Wallet } from 'webnative-filecoin';

Webnative.setup.debug({ enabled: true })

export function useFissionAuth({ host, protocol }) {
  const [state, setState] = useState<Webnative.State>(null)
  let fs;
  let authScenario: Webnative.Scenario | null = null;
  let username: string = null;
  let wallet: WebnativeFilecoin.Wallet;


  /** Webnative Initialization
   * Load webnative and configure permissions.
   * NOTE(bgins)
   */

  useEffect(() => {
    async function getState() {
      const result = await Webnative.initialise({
        permissions: {
          // NOTE(bgins): The Estuary token is stored in app storage
          // at bgins/estuary-www.
          app: {
            name: 'estuary-www',
            creator: 'arg',
          },
          fs: {
            // NOTE(bgins): The cosigner key is stored in the private filesystem
            // at the path Keychain/estuary-fil-cosigner.
            private: [Webnative.path.file('Keychain', 'estuary-fil-cosigner')]
          }
        },
      })
      setState(result)
    }

    getState()
  }, [])


  /** User and filesystem initialization
   * If the user is authenticated with Fission, set their authScenario,
   * filesytem, and username.
   * NOTE(bgins)
   */

  switch (state?.scenario) {
    case Webnative.Scenario.AuthSucceeded:
    case Webnative.Scenario.Continuation:
      authScenario = state.scenario;
      fs = state.fs;
      username = state.username;
      break;

    default:
      break;
  }


  /** Authorize
   * Redirect the user to the Fission auth lobby where permission to use
   * their filesystem will be requested. If they are new to Fission, they will
   * first be asked to create an account.
   * NOTE(bgins)
   */

  const authorise = (redirectBackTo: string) => {
    if (state) {
      Webnative.redirectToLobby(state.permissions, `${protocol}://${host}/${redirectBackTo}`)
    }
  }


  /** Sign in
   * If the user is signed in with Fission, but not signed into Estuary, retrieve their
   * Estuary token from WNFS. The token is stored encrypted at rest in WNFS.
   * The stored token will be invalidated the next time that the user signs out, so we
   * request a new token and store it in WNFS for the next sign in.
   * NOTE(bgins)
   */

  const signIn = async () => {
    if (fs) {
      // NOTE(bgins): Auth with stored token
      const token = await readToken()

      if (token) {
        // NOTE(bgins): Set the token
        Cookies.set(C.auth, token);

        // NOTE(bgins): Request a new token for the next time the user signs in
        const j = await R.post(`/user/api-keys`, {});
        if (j.error) {
          return j;
        }

        if (!j.token) {
          return {
            error: 'Our server failed to sign you in. Please contact us.',
          };
        }

        // NOTE(bgins): Store the new token in WNFS
        const tokenPath = fs.appPath(Webnative.path.file(C.auth));
        await fs.write(tokenPath, j.token);
        await publish(tokenPath);

        window.location.href = '/home';
        return;
      } else {
        window.location.href = '/account-setup';
        return;
      }
    } else {
      return {
        error: 'We could not load your webnative file system. Please contact us.',
      };
    }
  }


  /** Read token
   * Read the token from WNFS if it exists. Otherwise, return null to indicate
   * that we don't have one.
   * NOTE(bgins)
  */

  const readToken = async () => {
    if (fs) {
      const tokenPath = fs.appPath(Webnative.path.file(C.auth));

      if (await fs.exists(tokenPath)) {
        const token = await fs.read(tokenPath)
        return token;
      } else {
        return null;
      }
    }
  }


  /** Publish
   * Publish local changes to the user's filesystem on IPFS.
   * This is a blocking implementation that should not be typically used, but we 
   * use here to make sure we store tokens before changing window.location.href.
   * 
   * See the WNFS guide for the non-blocking implemenation of publish: 
   * https://guide.fission.codes/developers/webnative/file-system-wnfs
   * 
   * NOTE(bgins)
   */

  const publish = async (path) => {
    if (fs) {
      const cid = await fs.root.put();
      const ucan = await Webnative.ucan.dictionary.lookupFilesystemUcan(path);
      await Webnative.dataRoot.update(cid, ucan);
    } else {
      return {
        error: 'We could not load your webnative file system. Please contact us.',
      };
    }
  }

  /** Get or setup wallet
   * Call the cosigning server to set up the user's wallet or if they have one
   * get the address. The savedAddress is the address registered with the Estuary
   * server if any.
   * 
   * If the savedAdress is different from the address reported by the cosigning
   * server, update the user's wallet with Estuary.
   * NOTE(bgins)
   */

  const getWallet = async (savedAddress) => {
    if (fs) {
      console.log('saved address', savedAddress)
      wallet = await WebnativeFilecoin.getWallet(fs, Webnative);
      const address = wallet.getAddress();

      console.log('address from cosigner', address)
      // TODO: what is the default value for the address before the user sets one
      if (savedAddress === null || address !== savedAddress) {
        return { address, isNew: true }
      } else {
        return { address, isNew: false }
      }

    } else {
      return {
        error: 'We could not load your webnative file system. Please contact us.',
      };
    }
  }

  return { authorise, authScenario, fs, getWallet, publish, readToken, signIn, username }
}
