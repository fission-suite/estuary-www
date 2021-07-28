import styles from '@pages/app.module.scss';

import * as React from 'react';
import * as U from '@common/utilities';
import * as R from '@common/requests';
import * as Crypto from '@common/crypto';

import { useFissionAuth } from '@common/useFissionAuth';

import ProgressCard from '@components/ProgressCard';
import Navigation from '@components/Navigation';
import Page from '@components/Page';
import AuthenticatedLayout from '@components/AuthenticatedLayout';
import AuthenticatedSidebar from '@components/AuthenticatedSidebar';
import SingleColumnLayout from '@components/SingleColumnLayout';
import EmptyStatePlaceholder from '@components/EmptyStatePlaceholder';
import Input from '@components/Input';
import Button from '@components/Button';

import { H1, H2, H3, H4, P } from '@components/Typography';

export async function getServerSideProps(context) {
  const viewer = await U.getViewerFromHeader(context.req.headers);
  const host = context.req.headers.host;
  const protocol = host.split(':')[0] === 'localhost' ? 'http' : 'https';

  if (!viewer) {
    return {
      redirect: {
        permanent: false,
        destination: '/sign-in',
      },
    };
  }

  return {
    props: { viewer, host, protocol },
  };
}

const onSubmit = async (event, state, setState) => {
  setState({ ...state, loading: true });

  if (U.isEmpty(state.new)) {
    alert('Please provide a new password');
    return setState({ ...state, loading: false });
  }

  if (!U.isValidPassword(state.new)) {
    return {
      error: 'Please provide a password thats at least 8 characters with at least one letter and one number',
    };
  }

  if (U.isEmpty(state.confirm)) {
    alert('Please confirm your new password');
    return setState({ ...state, loading: false });
  }

  if (state.new !== state.confirm) {
    alert('Please make sure you confirmed your new password correctly');
    return setState({ ...state, loading: false });
  }

  let newPasswordHash = await Crypto.attemptHashWithSalt(state.new);

  let response;
  try {
    response = await R.put('/user/password', { newPasswordHash: newPasswordHash });
    await U.delay(1000);

    if (response.error) {
      alert(response.error);
      return setState({ ...state, new: '', confirm: '', loading: false });
    }
  } catch (e) {
    console.log(e);
    alert('Something went wrong');
    return setState({ ...state, new: '', confirm: '', loading: false });
  }

  alert('Your password has been changed.');
  return setState({ ...state, new: '', confirm: '', loading: false });
};

function SettingsPage(props: any) {
  const [state, setState] = React.useState({ loading: false, old: '', new: '', confirm: '' });
  const [address, setAddress] = React.useState('')
  const { fs, getWallet } = useFissionAuth({ host: props.host, protocol: props.protocol });

  React.useEffect(() => {
    async function performEffect() {
      if (fs) {
        const cosignerResponse = await getWallet(props.viewer.address);

        if (cosignerResponse.error) {
          alert(cosignerResponse.error);
        }

        if (cosignerResponse.isNew) {
          setAddress(cosignerResponse.address)
          // const response = await R.put('/user/address', { address: cosignerResponse.address });
        } else {
          setAddress(props.viewer.address);
        }
      }
    }

    performEffect();
  }, [fs]);

  const sidebarElement = <AuthenticatedSidebar active="SETTINGS" viewer={props.viewer} />;

  return (
    <Page title="Estuary: Settings: Account" description="Update your settings for your account." url="https://estuary.tech/settings">
      <AuthenticatedLayout navigation={<Navigation isAuthenticated isRenderingSidebar={!!sidebarElement} />} sidebar={sidebarElement}>
        <SingleColumnLayout>
          <H2>Settings</H2>
          <P style={{ marginTop: 16 }}>Update your user settings.</P>
        </SingleColumnLayout>

        <SingleColumnLayout>
          <H3>Change password</H3>
          <P style={{ marginTop: 16 }}>Please enter your old password and your new password to change your password.</P>

          <H4 style={{ marginTop: 32 }}>New password</H4>
          <Input
            style={{ marginTop: 8 }}
            placeholder="Pick something memorable"
            name="new"
            value={state.new}
            type="password"
            onChange={(e) => setState({ ...state, [e.target.name]: e.target.value })}
          />
          <aside className={styles.formAside}>Requirements: at least 8 characers, must use at least one letter and number.</aside>

          <H4 style={{ marginTop: 24 }}>Confirm new password</H4>
          <Input
            style={{ marginTop: 8 }}
            placeholder="Pick something memorable"
            name="confirm"
            value={state.confirm}
            type="password"
            onChange={(e) => setState({ ...state, [e.target.name]: e.target.value })}
            onSubmit={(e) => onSubmit(e, { ...state }, setState)}
          />

          <div className={styles.actions}>
            <Button loading={state.loading} onClick={(e) => onSubmit(e, { ...state }, setState)}>
              Change
            </Button>
          </div>

          <H3 style={{ marginTop: 64 }}>Default settings (read only)</H3>
          <P style={{ marginTop: 16 }}>Estuary is configured to default settings for deals. You can not change these values, yet.</P>

          <H4 style={{ marginTop: 24 }}>Fission Filecoin address</H4>
          <Input style={{ marginTop: 8 }} readOnly value={address ? address : ''} />
          <aside className={styles.formAside}>
            This address is provided to your account when you <strong>sign in with Fission</strong>. To learn more visit <a href="https://fission.codes">Fission's website</a>.
          </aside>

          <H4 style={{ marginTop: 24 }}>Replication</H4>
          <Input style={{ marginTop: 8 }} readOnly value={props.viewer.settings.replication} />
          <aside className={styles.formAside}>
            This is the amount of storage providers we will secure deals (sealed, on chain) with on the Filecoin Network. Once this happens we will stop.
          </aside>

          <H4 style={{ marginTop: 24 }}>Deal duration (30 second fil-epoch)</H4>
          <Input style={{ marginTop: 8 }} readOnly value={props.viewer.settings.dealDuration} />
          <aside className={styles.formAside}>
            Stored for {props.viewer.settings.dealDuration} filecoin-epochs ({((props.viewer.settings.dealDuration * 30) / 60 / 60 / 24).toFixed(2)} days). This Estuary node will
            auto renew deals if there is Filecoin in the address used to make deals.
          </aside>

          <H4 style={{ marginTop: 24 }}>Max staging wait (nanoseconds)</H4>
          <Input style={{ marginTop: 8 }} readOnly value={props.viewer.settings.maxStagingWait} />
          <aside className={styles.formAside}>
            The amount of time Estuary waits before making deals for a <a href="/staging">staging zone</a>. Currently Estuary waits{' '}
            {U.nanoToHours(props.viewer.settings.maxStagingWait)} hours.
          </aside>

          <H4 style={{ marginTop: 24 }}>Staging threshold (bytes)</H4>
          <Input style={{ marginTop: 8 }} readOnly value={props.viewer.settings.fileStagingThreshold} />
          <aside className={styles.formAside}>
            If you upload anything under {U.bytesToSize(props.viewer.settings.fileStagingThreshold)}, Estuary will initialize a staging area for those files.
          </aside>
        </SingleColumnLayout>
      </AuthenticatedLayout>
    </Page>
  );
}

export default SettingsPage;
