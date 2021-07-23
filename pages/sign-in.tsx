import styles from '@pages/app.module.scss';

import * as React from 'react';
import * as U from '@common/utilities';
import * as C from '@common/constants';
import * as R from '@common/requests';
import * as Crypto from '@common/crypto';

import * as webnative from 'webnative';
import { useFissionAuth } from '@common/useFissionAuth';

import Cookies from 'js-cookie';
import Page from '@components/Page';
import Navigation from '@components/Navigation';
import SingleColumnLayout from '@components/SingleColumnLayout';
import Input from '@components/Input';
import Button from '@components/Button';

import { H1, H2, H3, H4, P } from '@components/Typography';

export async function getServerSideProps(context) {
  const viewer = await U.getViewerFromHeader(context.req.headers);

  if (viewer) {
    return {
      redirect: {
        permanent: false,
        destination: '/home',
      },
    };
  }

  return {
    props: {},
  };
}

async function handleSignIn(state: any) {
  if (U.isEmpty(state.username)) {
    return { error: 'Please provide a username.' };
  }

  if (U.isEmpty(state.password)) {
    return { error: 'Please provide a password.' };
  }

  if (!U.isValidUsername(state.username)) {
    return { error: 'Your username must be 1-48 characters or digits.' };
  }

  // NOTE(jim) We've added a new scheme to keep things safe for users.
  state.passwordHash = await Crypto.attemptHashWithSalt(state.password);

  let r = await fetch(`${C.api.host}/login`, {
    method: 'POST',
    body: JSON.stringify({ passwordHash: state.passwordHash, username: state.username }),
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (r.status !== 200) {
    // NOTE(jim): We don't know the users password ever so we can't do anything on their
    // behalf, but if they were authenticated using the old method, we can do one more retry.
    const retryHash = await Crypto.attemptHash(state.password);

    let retry = await fetch(`${C.api.host}/login`, {
      method: 'POST',
      body: JSON.stringify({ passwordHash: retryHash, username: state.username }),
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (retry.status !== 200) {
      return { error: 'Failed to authenticate' };
    }

    const retryJSON = await retry.json();
    if (retryJSON.error) {
      return retryJSON;
    }

    if (!retryJSON.token) {
      return { error: 'Failed to authenticate' };
    }

    console.log('Authenticated using legacy scheme.');

    Cookies.set(C.auth, retryJSON.token);

    console.log('Attempting legacy scheme revision on your behalf');

    try {
      const response = await R.put('/user/password', { newPasswordHash: state.passwordHash });
    } catch (e) {
      console.log('Failure:', e);
    }

    window.location.href = '/home';
    return;
  }

  const j = await r.json();
  if (j.error) {
    return j;
  }

  if (!j.token) {
    return { error: 'Failed to authenticate' };
  }

  console.log('Authenticated using advanced scheme.');
  Cookies.set(C.auth, j.token);
  window.location.href = '/home';
  return;
}

async function handleFissionAuth({ authorise, authScenario, signIn }) {
  if (authScenario === webnative.Scenario.AuthSucceeded || authScenario === webnative.Scenario.Continuation) {
    return await signIn();
  } else {
    authorise('authed-with-fission');
  }
}

function SignInPage(props: any) {
  const [state, setState] = React.useState({ loading: false, fissionLoading: false, username: '', password: '', key: '' });
  const { authorise, signIn, authScenario } = useFissionAuth();

  return (
    <Page title="Estuary: Sign in" description="Sign in to your Estuary account." url="https://estuary.tech/sign-in">
      <Navigation active="SIGN_IN" />
      <SingleColumnLayout style={{ maxWidth: 488 }}>
        <H2>Sign in</H2>

        <H3 style={{ marginTop: 16 }}>Sign in with Fission</H3>
        <P style={{ marginTop: 8 }}>Sign in here if you created your account with Fission.</P>
        <Button
          style={{
            width: '100%',
            marginTop: 12,
            background: 'var(--main-button-background-fission)',
          }}
          loading={state.fissionLoading ? state.fissionLoading : undefined}
          onClick={async () => {
            // Show loading state only if user is authed, otherwise we will be redirecting
            if (authScenario === webnative.Scenario.AuthSucceeded || authScenario === webnative.Scenario.Continuation) {
              setState({ ...state, fissionLoading: true });
            }
            const response = await handleFissionAuth({
              authorise,
              authScenario,
              signIn,
            });
            if (response && response.error) {
              alert(response.error);
              setState({ ...state, fissionLoading: false });
            }
          }}
        >
          Sign in with Fission
        </Button>
        <aside className={styles.formAside}>{state.fissionLoading ? 'One moment, we are signing you in with Fission.' : ''}</aside>

        <H3 style={{ marginTop: 32 }}>Sign in</H3>
        <P style={{ marginTop: 16 }}>If you have created an account with Estuary before, you can use your username and password to sign in.</P>
        <H4 style={{ marginTop: 32 }}>Username</H4>
        <Input
          style={{ marginTop: 8 }}
          placeholder="Your account's username"
          name="username"
          value={state.username}
          onChange={(e) => setState({ ...state, [e.target.name]: e.target.value })}
        />

        <H4 style={{ marginTop: 24 }}>Password</H4>
        <Input
          style={{ marginTop: 8 }}
          placeholder="Your account's password"
          type="password"
          value={state.password}
          name="password"
          onChange={(e) => setState({ ...state, [e.target.name]: e.target.value })}
          onSubmit={async () => {
            setState({ ...state, loading: true });
            const response = await handleSignIn(state);
            if (response && response.error) {
              alert(response.error);
              setState({ ...state, loading: false });
            }
          }}
        />

        <div className={styles.actions}>
          <Button
            style={{ width: '100%' }}
            loading={state.loading ? state.loading : undefined}
            onClick={async () => {
              setState({ ...state, loading: true });
              const response = await handleSignIn(state);
              if (response && response.error) {
                alert(response.error);
                setState({ ...state, loading: false });
              }
            }}
          >
            Sign in
          </Button>
          <Button
            style={{
              width: '100%',
              marginTop: 12,
              background: 'var(--main-button-background-secondary)',
              color: 'var(--main-button-text-secondary)',
            }}
            href="/sign-up"
          >
            Create an account instead
          </Button>
        </div>

        <H3 style={{ marginTop: 32 }}>Authenticate Using Key</H3>
        <P style={{ marginTop: 8 }}>You can authenticate using an API key if you have one.</P>

        <H4 style={{ marginTop: 32 }}>API key</H4>
        <Input
          style={{ marginTop: 8 }}
          placeholder="ex: ESTxxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxxARY"
          name="key"
          value={state.key}
          onChange={(e) => setState({ ...state, [e.target.name]: e.target.value })}
        />

        <div className={styles.actions}>
          <Button
            style={{ width: '100%' }}
            onClick={async () => {
              if (U.isEmpty(state.key)) {
                alert('Please provide a valid key');
                return null;
              }

              console.log('Impersonating...');
              Cookies.set(C.auth, state.key);
              window.location.reload();
            }}
          >
            Authenticate
          </Button>
        </div>
      </SingleColumnLayout>
    </Page>
  );
}

export default SignInPage;
