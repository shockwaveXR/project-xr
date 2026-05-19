import { useTwitchLive } from '../hooks/use-twitch-live';

// twitch player iframe needs `parent` query params for every domain it can be
// embedded on — the player blocks if the host doesn't match. include localhost
// for `npm run dev` and the github-pages host for production. add 127.0.0.1
// too since some lan-test setups hit the dev server via the raw IP.
const TWITCH_PARENTS = [
  'localhost',
  '127.0.0.1',
  'voltage770.github.io',
];

const twitchEmbedUrl = (channel) => {
  const parents = TWITCH_PARENTS.map(p => `parent=${encodeURIComponent(p)}`).join('&');
  return `https://player.twitch.tv/?channel=${channel}&${parents}&muted=true`;
};

export default function AboutPage() {
  // channel comes from the cloudflare worker (TWITCH_CHANNEL var in
  // wrangler.toml). that's the single source of truth — change the streamer
  // handle there + redeploy worker, frontend stays untouched. localStorage
  // cache in the hook keeps the link / display text from flashing empty
  // on first paint.
  const { isLive, channel } = useTwitchLive();

  return (
    <div className="about-page">
      <h1>about</h1>
      <aside className="news-about">
        <p>
          this is a personal passion project aimed at creating a useful and aesthetically pleasing
          pokemon database — effortlessly traversable across multiple types of devices and input
          methods, and free from the clutter and distractions i've encountered while browsing
          others of its kind
        </p>
        <p>
          this project bridges together the foundational software development knowledge i gathered
          during my undergraduate degree with the efficiency of agentic coding tools to bring to life
          one of many projects i've always dreamed of making, but never had the time to set aside
          for
        </p>
        <p>please, enjoy</p>
        <p>— jackson</p>
        <ul className="news-about__links">
          <li>
            <a href="https://github.com/voltage770" target="_blank" rel="noopener noreferrer">
              github
            </a>
          </li>
          {channel && (
            <li>
              <a href={`https://www.twitch.tv/${channel}`} target="_blank" rel="noopener noreferrer">
                twitch
              </a>
            </li>
          )}
        </ul>

        {isLive && channel && (
          <section className="twitch-embed" aria-label="live stream">
            <div className="twitch-embed__header">
              <span className="twitch-embed__pulse" />
              <span className="twitch-embed__title">streaming now on twitch</span>
            </div>
            <div className="twitch-embed__frame">
              <iframe
                src={twitchEmbedUrl(channel)}
                title={`${channel} live stream`}
                allowFullScreen
                allow="autoplay; fullscreen"
              />
            </div>
          </section>
        )}
      </aside>
    </div>
  );
}
