using System.IO;
using System.Reflection;
using Moq;
using NUnit.Framework;

namespace MvcMiniProfiler.Tests
{
    public class TestContainer
    {
        protected MockRepository Factory { get; set; }

        [SetUp]
        public void TestSetup()
        {
            Factory = new MockRepository(MockBehavior.Strict);
            Setup();
        }

        public virtual void Setup() { }

        [TearDown]
        public void TestTeardown()
        {
            try
            {
                Teardown();
            }
            finally
            {
                Factory.VerifyAll();
            }
        }

        public virtual void Teardown() { }

        public string ReadTestData(string fileName)
        {
            using (var sr = new StreamReader(Assembly.GetExecutingAssembly().GetManifestResourceStream("MvcMiniProfiler.Tests." + fileName)))
                return sr.ReadToEnd();
        }
    }
}
