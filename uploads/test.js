const essays = {
  "Climate Change and Our Responsibility": `
    Climate Change and Our Responsibility

    Climate change is one of the most urgent problems the world faces today. It affects every part of our planet, from melting ice caps in the Arctic to rising sea levels and extreme weather patterns. Scientists have proven that most of these changes are caused by human activities, especially burning fossil fuels and cutting down forests.

The effects of climate change are already visible. Many countries experience floods, droughts, and heatwaves more often than before. These events destroy homes, crops, and wildlife. People who live in small islands or low-lying countries suffer the most because their lands are disappearing under the sea.

To solve this issue, governments and individuals must act together. Governments should support renewable energy sources like solar and wind power, while individuals can reduce waste, recycle, and plant trees. Schools should also teach students about sustainability and environmental protection.

In conclusion, climate change is not just an environmental problem—it is a global responsibility. Every action we take, no matter how small, can help protect our planet for future generations.
  `,
  "The Importance of Reading Books": `
    The Importance of Reading Books

Reading books is a very good habit that helps people to learn and grow. Books give us knowledge, imagination, and ideas about the world. When I was small, I did not like reading because I thought it was boring. But later, I found a storybook that changed my mind. It was about a boy who traveled around the world, and I loved it.

Books teach us many lessons that we cannot learn from TV or the internet. When we read, we use our imagination to see the characters and places in our mind. Reading also improves our vocabulary and grammar. For students, reading helps in writing better essays and answering questions clearly.

Nowadays, many people only read on their phones, but I still prefer paper books. They feel real and comfortable to hold. I think every school should have a library with interesting books for students. If everyone reads at least one book each month, the world will become smarter and kinder.
  `,
  "My Favorite Hobby - Watching Movies": `
   My Favorite Hobby – Watching Movies

Watching movies is my favorite hobby because it makes me feel relaxed and happy. I usually watch movies at night after finishing my homework. My favorite movie is Avengers because it has a lot of action and funny parts. Sometimes I watch movies with my friends and family. We eat popcorn and talk about the story after watching it.

Movies are good because they teach us different things about life. For example, some movies show how to be brave, and others teach us to help people. I like movies that have happy endings because they make me feel positive.

But watching too many movies is not good. It can waste time, and our eyes will hurt. So I think we should watch movies only when we finish our work. I also want to make my own short movie one day about school life. I think it will be fun and people will enjoy it.
  `,
  "The Internet: A Good and Bad Thing": 
  `
  The Internet: A Good and Bad Thing

Intoduction

The internet is very big deal nowdays. It has changed are lives is so many way's, It's hard to even remember what life was like before it. This essay will talk about the good cides and the bad side of the intemet. It is a very complex issue that many people have many different opinions on. Some people think its the best thing ever, while others think its cousing problems. We will look at both of these point of views to try and come to a conclusion.

The Good Parts of Internet

Firstly, the internet is very convienent for communication. For example, you can send a email to someone on the other side of the world and they get it instantly. This is much better then waiting for a letter which could take weeks. Also, with social media platforms like Instagram and Tiktok, J you can stay in touch with friends and family all the time. It helps people feel connected. Another good thing is the amount of information. You can find out anything you want by just searching en Google. This is very useful for students doing there homework or just for learning new things. It is basically a huge habrary right at your fingertips.

The Bad Ports of Internet

However they're is also many negative affects. A major problem is cyber. bullying. Because people can be anonomous online, they say mean things would never in real life. This can lead to serious mental health they say issues for the victims. Another issue is the spread of mis Not everything you read can the internet is true. Fake news on very quickly and this can be dangerous for society. For instance, the pandemic, there was a lot of bad information about vaccines.
  `
};

const getEssay = (tit) => {
  if (!tit) {
    return null; 
  }
  
  const normalizedTitle = Object.keys(essays).find(title => 
    title.toLowerCase() === tit.toLowerCase()
  );
  
  return normalizedTitle ? essays[normalizedTitle].trim() : null;
}

module.exports = getEssay;